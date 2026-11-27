const WLLAMA_VERSION = '3.8.1';
const WLLAMA_CDN = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}`;
const LOAD_PARAMS = Object.freeze({ n_ctx: 4096, n_batch: 512, n_ubatch: 512, n_parallel: 1, jinja: true, ctx_shift: false });

export function createLocalModelEngine({
    host: window, getQualityTier, getModelUrl, qualityTiers, getDevicePreference,
    t, localError, friendlyError, cancelledError, rawText, logDetail, onUnload,
}) {
    const state = { phase: 'unknown', loadedBytes: 0, totalBytes: 0, device: null, error: null, downloadedTiers: [] };
    const listeners = new Set();
    // Every phase change bumps the version, so a slower status check never
    // overwrites newer work. A soft update is only a guess the check may correct.
    let statusVersion = 0;
    function setState(patch, { soft = false } = {}) {
        if (!soft && 'phase' in patch) statusVersion++;
        Object.assign(state, patch);
        if (!listeners.size) return;
        const snapshot = { ...state };
        for (const listener of listeners) {
            try { listener(snapshot); } catch { /* A closed settings card must not break the engine. */ }
        }
    }
    const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    };

    // ============================================
    // Engine
    // ============================================

    let wllamaModulePromise = null;
    let engine = null;
    let loadedModelUrl = null;
    let loadPromise = null;
    // The download in progress ({ url, controller, promise }); there is never more than one.
    let activeDownload = null;
    let webGpuAvailable = null;

    const importModule = (url) => (typeof window.__ivLyricsLocalModelImport === 'function'
        ? window.__ivLyricsLocalModelImport(url)
        : import(url));

    function loadWllamaModule() {
        if (!wllamaModulePromise) {
            wllamaModulePromise = Promise.resolve()
                .then(() => importModule(`${WLLAMA_CDN}/esm/index.js`))
                .catch((error) => {
                    wllamaModulePromise = null;
                    throw friendlyError(error, 'engine');
                });
        }
        return wllamaModulePromise;
    }

    // One Wllama instance manages the model cache (OPFS) and, once loaded, runs inference.
    async function getEngine() {
        if (engine) return engine;
        const { Wllama } = await loadWllamaModule();
        if (!engine) {
            try {
                engine = new Wllama({ default: `${WLLAMA_CDN}/src/wasm/wllama.wasm` }, {
                    suppressNativeLog: true,
                    logger: {
                        debug() {},
                        log() {},
                        warn: (...args) => console.warn('[Local AI]', ...args),
                        error: (...args) => console.error('[Local AI]', ...args)
                    }
                });
            } catch (error) {
                throw friendlyError(error, 'engine');
            }
        }
        return engine;
    }

    // Only finished downloads are models to wllama: it writes a file's metadata
    // after the last byte and skips files without metadata.
    const listModels = (instance) => instance.modelManager.getModels({ includeInvalid: true });

    async function listCachedModels() {
        return listModels(await getEngine());
    }

    async function findCachedModel(url = getModelUrl()) {
        const models = await listCachedModels();
        return models.find((model) => model.url === url) || null;
    }

    const isValidModel = (model) => !!model && model.validate() === 'valid';
    const isBusy = () => !!activeDownload || !!loadPromise || state.phase === 'downloading' || state.phase === 'loading';

    async function refreshStatus() {
        const version = ++statusVersion;
        if (isBusy()) return { ...state };
        const tier = getQualityTier();
        try {
            const models = await listCachedModels();
            // A download, a model load or a newer check may have started while the
            // cache was being read; that work owns the status now.
            if (version !== statusVersion || isBusy()) return { ...state };
            const downloadedTiers = qualityTiers
                .filter((candidate) => isValidModel(models.find((model) => model.url === getModelUrl(candidate))))
                .map((candidate) => candidate.id);
            const loaded = engine?.isModelLoaded?.() && loadedModelUrl === getModelUrl(tier);
            setState({
                phase: loaded ? 'ready' : (downloadedTiers.includes(tier.id) ? 'downloaded' : 'missing'),
                totalBytes: tier.size,
                downloadedTiers,
                error: null,
                ...(loaded ? {} : { device: null })
            });
        } catch (error) {
            const failure = friendlyError(error, 'cache');
            if (version === statusVersion && !isBusy()) setState({ phase: 'error', error: failure.message });
        }
        return { ...state };
    }

    async function hasWebGpu() {
        if (webGpuAvailable !== null) return webGpuAvailable;
        try {
            webGpuAvailable = Boolean(await navigator.gpu?.requestAdapter?.({ powerPreference: 'high-performance' }));
        } catch {
            webGpuAvailable = false;
        }
        return webGpuAvailable;
    }

    async function exitEngine(instance) {
        if (!instance) return;
        let timer = null;
        try {
            await Promise.race([
                instance.exit(),
                new Promise((resolve) => { timer = setTimeout(resolve, 5000); })
            ]);
        } catch (error) {
            console.warn('[Local AI] Failed to release the engine:', rawText(error));
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    async function unloadModel() {
        onUnload();
        const instance = engine;
        const version = statusVersion;
        engine = null;
        loadedModelUrl = null;
        await exitEngine(instance);
        if (!engine && statusVersion === version && (state.phase === 'ready' || state.phase === 'loading')) {
            // After a quality change the pending status check knows better.
            setState({ phase: 'downloaded', device: null }, { soft: true });
        }
    }

    function ensureLoaded() {
        const url = getModelUrl();
        if (engine?.isModelLoaded?.() && loadedModelUrl === url) return Promise.resolve(engine);
        if (activeDownload || state.phase === 'downloading') {
            // The download shares the engine instance; leave it and its status untouched.
            return Promise.reject(localError('busy', t('downloadBusy', 'Wait for the model download to finish, then try again.')));
        }
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            if (engine?.isModelLoaded?.()) await unloadModel();
            const model = await findCachedModel(url);
            if (!isValidModel(model)) {
                setState({ phase: 'missing', device: null });
                throw localError('notReady', t('notReady', 'The local model is not ready yet. Download it first in Settings > AI Providers > Local AI.'));
            }
            setState({ phase: 'loading', error: null });
            const useGpu = getDevicePreference() === 'auto' && await hasWebGpu();
            let usedGpu = useGpu;
            try {
                await (await getEngine()).loadModel(model, { ...LOAD_PARAMS, n_gpu_layers: useGpu ? 99999 : 0 });
            } catch (error) {
                if (!useGpu) throw error;
                // A WebGPU failure on this adapter still leaves the slower CPU path.
                console.warn('[Local AI] WebGPU load failed; retrying on the CPU:', rawText(error));
                const failed = engine;
                engine = null;
                await exitEngine(failed);
                await (await getEngine()).loadModel(model, { ...LOAD_PARAMS, n_gpu_layers: 0 });
                usedGpu = false;
            }
            if (!engine.getChatTemplate?.()) {
                throw new Error('[Local AI] The model has no chat template.');
            }
            loadedModelUrl = url;
            setState({ phase: 'ready', device: usedGpu ? 'WebGPU' : 'CPU', error: null });
            return engine;
        })().catch(async (error) => {
            const failure = friendlyError(error, 'load');
            const keepPhase = state.phase === 'missing';
            const failed = engine;
            engine = null;
            loadedModelUrl = null;
            await exitEngine(failed);
            if (!keepPhase) setState({ phase: 'error', device: null, error: failure.message });
            throw failure;
        }).finally(() => {
            loadPromise = null;
        });
        return loadPromise;
    }

    // Deleting by URL also removes a file whose download never finished; the
    // model list (and Model.remove) only know files that have metadata.
    async function deleteCachedFile(instance, url, model = null) {
        const cache = instance?.modelManager?.cacheManager;
        if (typeof cache?.delete === 'function') {
            await cache.delete(url);
        } else if (model) {
            await model.remove();
        }
    }

    async function removeUnfinishedDownload(instance, url) {
        try {
            const models = await listModels(instance);
            if (isValidModel(models.find((model) => model.url === url))) return;
            await deleteCachedFile(instance, url);
        } catch (error) {
            logDetail('Could not remove an unfinished download', error);
        }
    }

    function downloadModel() {
        // Another click (or a second settings card) joins the download already running.
        if (activeDownload) return activeDownload.promise;
        const tier = getQualityTier();
        const url = getModelUrl(tier);
        const controller = new AbortController();
        const download = { url, controller, promise: null };
        const finish = (patch) => {
            if (activeDownload === download) activeDownload = null;
            setState(patch);
        };
        const stopIfCancelled = () => {
            if (controller.signal.aborted) throw cancelledError();
        };
        activeDownload = download;
        setState({ phase: 'downloading', loadedBytes: 0, totalBytes: tier.size, error: null });
        download.promise = (async () => {
            let instance = null;
            let lastUpdate = 0;
            try {
                instance = await getEngine();
                stopIfCancelled();
                if (!isValidModel(await findCachedModel(url))) {
                    stopIfCancelled();
                    await instance.modelManager.downloadModel({ url }, {
                        signal: controller.signal,
                        progressCallback: ({ loaded, total }) => {
                            if (controller.signal.aborted) return;
                            const now = Date.now();
                            if (now - lastUpdate < 250 && loaded < total) return;
                            lastUpdate = now;
                            setState({ loadedBytes: loaded, totalBytes: total > 0 ? total : tier.size });
                        }
                    });
                }
            } catch (error) {
                const cancelled = controller.signal.aborted || error?.name === 'AbortError';
                const failure = cancelled ? null : friendlyError(error, 'download');
                // wllama leaves the partial file of a cancelled or failed download behind.
                if (instance) await removeUnfinishedDownload(instance, url);
                if (cancelled) {
                    finish({ phase: 'missing', loadedBytes: 0, error: null });
                    return;
                }
                finish({ phase: 'error', loadedBytes: 0, error: failure.message });
                throw failure;
            }
            const downloadedTiers = qualityTiers.map((candidate) => candidate.id)
                .filter((id) => id === tier.id || state.downloadedTiers.includes(id));
            finish({
                phase: downloadedTiers.includes(getQualityTier().id) ? 'downloaded' : 'missing',
                loadedBytes: tier.size, totalBytes: tier.size, downloadedTiers, error: null
            });
        })();
        return download.promise;
    }

    const cancelDownload = () => activeDownload?.controller.abort();

    async function removeModel() {
        if (activeDownload) {
            throw localError('busy', t('downloadBusy', 'Wait for the model download to finish, then try again.'));
        }
        await unloadModel();
        const tier = getQualityTier();
        const instance = await getEngine();
        const models = await listModels(instance);
        const modelOf = (candidate) => models.find((model) => model.url === getModelUrl(candidate)) || null;
        await deleteCachedFile(instance, getModelUrl(tier), modelOf(tier));
        // Partial files from interrupted downloads of every quality go too;
        // finished downloads of the other qualities stay.
        for (const candidate of qualityTiers) {
            if (candidate.id === tier.id || isValidModel(modelOf(candidate))) continue;
            try {
                await deleteCachedFile(instance, getModelUrl(candidate), modelOf(candidate));
            } catch (error) {
                logDetail('Could not remove an unfinished download', error);
            }
        }
        setState({
            phase: 'missing', loadedBytes: 0, device: null, error: null,
            downloadedTiers: state.downloadedTiers.filter((id) => id !== tier.id)
        });
    }

    return {
        ensureLoaded, unloadModel, downloadModel, cancelDownload, removeModel, refreshStatus,
        getSnapshot: () => ({ ...state }), subscribe, setState,
        isModelLoaded: () => engine?.isModelLoaded?.(),
    };
}
