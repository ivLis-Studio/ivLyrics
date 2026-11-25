export function createLocalModelSettings({
    React, t, getSnapshot, subscribe, refreshStatus, getQualityTier, getDevicePreference,
    getIdleUnloadMinutes, getCurrentTargetLanguage, targetLanguageName, unsupportedLanguageText,
    setSetting, runTask, unloadModel, removeModel, downloadModel, cancelDownload,
    rescheduleIdleUnload, runTestTranslation, cancelledError, friendlyError, reportRemovalError,
    qualityTiers, idleUnloadOptions,
}) {
    const { useState, useEffect } = React;
    const h = React.createElement;
    const tierLabel = (tier) => t(tier.labelKey, tier.fallback);
    const formatGigabytes = (bytes) => `${(bytes / 1e9).toFixed(2)}GB`;

    function statusText(snapshot) {
        switch (snapshot.phase) {
            case 'downloading': {
                const total = snapshot.totalBytes || getQualityTier().size;
                return t('statusDownloading', 'Downloading {percent}% · {loaded} / {total} MB', {
                    percent: Math.floor(Math.min(1, snapshot.loadedBytes / total) * 100),
                    loaded: Math.round(snapshot.loadedBytes / 1e6),
                    total: Math.round(total / 1e6)
                });
            }
            case 'downloaded': return t('statusDownloaded', 'Downloaded · Loads into memory when it translates');
            case 'loading': return t('statusLoading', 'Loading into memory…');
            case 'ready': return t('statusReady', 'Ready · {device}', { device: snapshot.device || 'WebGPU' });
            case 'error': return t('statusError', 'Error: {error}', { error: snapshot.error || '' });
            case 'missing': return t('statusNotDownloaded', 'Not downloaded yet. Download the model once to translate on this device.');
            default: return '…';
        }
    }

    const idleLabel = (minutes) => {
        if (!minutes) return t('idleNever', 'Never');
        if (minutes % 60 === 0) return t('idleAfterHours', 'After {hours} hr', { hours: minutes / 60 });
        return t('idleAfter', 'After {minutes} min', { minutes });
    };

    return function LocalModelSettings() {
        const [snapshot, setSnapshot] = useState(getSnapshot);
        const [tierId, setTierId] = useState(() => getQualityTier().id);
        const [device, setDevice] = useState(getDevicePreference);
        const [idleMinutes, setIdleMinutes] = useState(getIdleUnloadMinutes);
        const [confirmRemove, setConfirmRemove] = useState(false);
        const [test, setTest] = useState(null);
        const [testRun] = useState(() => ({ id: 0, job: null }));

        useEffect(() => subscribe(setSnapshot), []);
        useEffect(() => { void refreshStatus(); }, [tierId]);
        useEffect(() => () => {
            testRun.id++;
            testRun.job?.stop(cancelledError());
            testRun.job = null;
        }, []);

        const busy = snapshot.phase === 'downloading' || snapshot.phase === 'loading';
        const hasModel = snapshot.phase === 'downloaded' || snapshot.phase === 'ready';
        // Say so before anyone downloads the model for a language it cannot translate into.
        const targetLanguage = getCurrentTargetLanguage();
        const clearTest = () => {
            testRun.id++;
            testRun.job?.stop(cancelledError());
            testRun.job = null;
            setTest(null);
        };
        useEffect(() => { clearTest(); }, [targetLanguage]);
        const languageSupported = !!targetLanguageName(targetLanguage);
        const tierIndex = Math.max(0, qualityTiers.findIndex((candidate) => candidate.id === tierId));
        const tier = qualityTiers[tierIndex];
        const downloadedTiers = Array.isArray(snapshot.downloadedTiers) ? snapshot.downloadedTiers : [];
        const percent = snapshot.phase === 'downloading'
            ? Math.min(100, (snapshot.loadedBytes / (snapshot.totalBytes || tier.size)) * 100)
            : 0;

        const selectTier = (id) => {
            if (busy || id === tierId || !qualityTiers.some((candidate) => candidate.id === id)) return;
            setSetting('quality', id);
            setTierId(id);
            setConfirmRemove(false);
            clearTest();
            void runTask(unloadModel);
        };
        const changeDevice = async (event) => {
            const next = event.target.value === 'cpu' ? 'cpu' : 'auto';
            setSetting('device', next);
            setDevice(next);
            clearTest();
            await runTask(unloadModel);
        };
        const changeIdle = (event) => {
            const next = Number(event.target.value);
            setSetting('idle-unload-minutes', next);
            setIdleMinutes(next);
            rescheduleIdleUnload();
        };
        const startDownload = () => { clearTest(); void downloadModel().catch(() => {}); };
        const freeMemory = () => { clearTest(); void runTask(unloadModel); };
        const deleteModel = () => {
            if (!confirmRemove) {
                setConfirmRemove(true);
                return;
            }
            setConfirmRemove(false);
            clearTest();
            void runTask(removeModel).catch(reportRemovalError);
        };
        const testTranslation = async () => {
            if (testRun.job || busy || !languageSupported) return;
            const id = ++testRun.id;
            setTest({ running: true });
            try {
                const result = await runTestTranslation((job) => { testRun.job = job; });
                if (id !== testRun.id) return;
                setTest({ ok: true, result, tierId, text: `✓ ${result.sample} → ${result.line}` });
            } catch (error) {
                if (id !== testRun.id) return;
                setTest({ ok: false, text: `✗ ${friendlyError(error, 'translate').message}` });
            } finally {
                if (id === testRun.id) testRun.job = null;
            }
        };

        const lastTier = qualityTiers.length - 1;
        const qualityControl = h('div', { className: 'ai-addon-setting local-model-quality' },
            h('label', null, t('quality', 'Translation quality')),
            h('div', { className: `slider-container${busy ? ' disabled' : ''}` },
                h('input', {
                    type: 'range', min: 0, max: lastTier, step: 1, value: tierIndex, disabled: busy,
                    className: 'config-slider',
                    'aria-label': t('quality', 'Translation quality'),
                    'aria-valuetext': tierLabel(tier),
                    style: { '--progress-percent': `${(tierIndex / lastTier) * 100}%` },
                    onChange: (event) => selectTier(qualityTiers[Number(event.target.value)]?.id)
                })
            ),
            h('div', { className: `local-model-tiers${busy ? ' is-busy' : ''}` }, qualityTiers.map((candidate) => {
                const selected = candidate.id === tier.id;
                return h('div', {
                    key: candidate.id,
                    className: `local-model-tier${selected ? ' is-selected' : ''}`,
                    role: 'button',
                    tabIndex: busy ? -1 : 0,
                    'aria-pressed': selected,
                    'aria-disabled': busy || undefined,
                    'data-tier': candidate.id,
                    onClick: () => selectTier(candidate.id),
                    onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            selectTier(candidate.id);
                        }
                    }
                },
                h('span', { className: 'local-model-tier-name' }, tierLabel(candidate)),
                h('span', { className: 'local-model-tier-size' },
                    formatGigabytes(candidate.size) + (downloadedTiers.includes(candidate.id) ? ` · ${t('tierDownloaded', 'Downloaded')}` : '')));
            })),
            h('small', { className: 'local-model-hint' },
                t('tierHint', 'Higher quality translates more accurately but uses more storage and memory.'))
        );

        // Without a supported language the download is not offered, so the line
        // inviting one would only contradict the notice.
        const showStatus = languageSupported || (snapshot.phase !== 'missing' && snapshot.phase !== 'unknown');

        return h('div', { className: 'ai-addon-settings local-model-settings' },
            qualityControl,
            h('div', { className: 'ai-addon-setting' },
                !languageSupported && h('small', {
                    className: 'ai-addon-test-status error',
                    role: 'note',
                    style: { display: 'block', marginBottom: '8px', lineHeight: 1.5 }
                }, unsupportedLanguageText(targetLanguage)),
                showStatus && h('span', {
                    className: `ai-addon-test-status ${snapshot.phase === 'error' ? 'error' : snapshot.phase === 'ready' ? 'success' : ''}`,
                    role: 'status'
                }, statusText(snapshot)),
                snapshot.phase === 'downloading' && h('div', {
                    className: 'local-model-progress',
                    role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.floor(percent),
                }, h('div', { className: 'local-model-progress-bar', style: { width: `${percent}%` } })),
                h('div', { className: 'ai-addon-input-group', style: { marginTop: '10px', flexWrap: 'wrap' } },
                    snapshot.phase === 'downloading'
                        ? h('button', { type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary', onClick: cancelDownload }, t('cancel', 'Cancel'))
                        : !hasModel && h('button', {
                            type: 'button', className: 'ai-addon-btn ai-addon-btn-primary', onClick: startDownload, disabled: busy || !languageSupported
                        }, t('download', 'Download model ({size})', { size: formatGigabytes(tier.size) })),
                    hasModel && h('button', {
                        type: 'button', className: 'ai-addon-btn ai-addon-btn-primary', onClick: testTranslation, disabled: busy || test?.running || !languageSupported
                    }, test?.running ? '…' : t('test', 'Test translation')),
                    snapshot.phase === 'ready' && h('button', {
                        type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary', onClick: freeMemory
                    }, t('unload', 'Free memory')),
                    hasModel && h('button', {
                        type: 'button', className: 'ai-addon-btn ai-addon-btn-secondary', onClick: deleteModel, disabled: busy
                    }, confirmRemove ? t('confirmRemove', 'Click again to delete') : t('remove', 'Delete model'))
                ),
                test && !test.running && h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': true,
                    style: { marginTop: '8px', overflowWrap: 'anywhere' } },
                    h('small', { className: `ai-addon-test-status ${test.ok ? 'success' : 'error'}` }, test.text),
                    test.ok && h('small', { style: { display: 'block', marginTop: '4px' } },
                        t('testTotalTime', 'Total: {seconds}s', { seconds: test.result.seconds.toFixed(1) })),
                    test.ok && h('small', { style: { display: 'block', marginTop: '4px' } },
                        test.result.performance
                            ? t('testSpeed', '{speed} output tokens/s · {tokens} tokens · {seconds}s decoding', {
                                speed: test.result.performance.tokensPerSecond.toFixed(1), tokens: test.result.performance.tokens,
                                seconds: test.result.performance.seconds.toFixed(2)
                            })
                            : t('testSpeedUnavailable', 'Output speed unavailable for this test.')),
                    test.ok && test.result.performance && h('small', { className: 'local-model-hint', style: { display: 'block', marginTop: '4px' } },
                        t('testSpeedScope', 'Decoding only; excludes download, loading and prompt processing. Speed varies by device, preset and text.')),
                    test.ok && tierIndex > 0 && test.tierId === tierId && h('small', { className: 'local-model-hint', style: { display: 'block', marginTop: '4px' } },
                        t('testSmallerHint', 'If this feels slow, try {tier}, a smaller preset; speed and quality may vary.', {
                            tier: tierLabel(qualityTiers[tierIndex - 1])
                        })))
            ),
            h('div', { className: 'ai-addon-setting' },
                h('label', null, t('device', 'Processor')),
                h('select', { value: device, onChange: changeDevice, disabled: busy },
                    h('option', { value: 'auto' }, t('deviceAuto', 'Auto (WebGPU first)')),
                    h('option', { value: 'cpu' }, t('deviceCpu', 'CPU only (slower)')))
            ),
            h('div', { className: 'ai-addon-setting' },
                h('label', null, t('idleUnload', 'Free memory when idle')),
                h('select', { value: String(idleMinutes), onChange: changeIdle },
                    idleUnloadOptions.map((minutes) => h('option', { key: minutes, value: String(minutes) },
                        idleLabel(minutes))))
            ),
            h('small', { className: 'local-model-privacy' },
                t('privacy', 'Lyrics are translated on this device and are never sent anywhere. The engine (jsDelivr) and the model (Hugging Face) are downloaded only once.'))
        );
    };
}
