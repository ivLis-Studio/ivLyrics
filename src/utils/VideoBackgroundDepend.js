(function youtubeAdBlockerEntry() {
    // Blocks YouTube iframe ads loaded inside Spicetify by sanitizing requests and patching the player API.
    const waitForSpicetify = () => {
        if (!window.Spicetify || !Spicetify.Player || !document.body) {
            setTimeout(waitForSpicetify, 250);
            return;
        }
        initialize();
    };

    const logPrefix = "[ivLyrics VBD]";

    const blockedPatterns = [
        /doubleclick\.net/i,
        /googlesyndication\.com/i,
        /googleads\.g\.doubleclick\.net/i,
        /pagead(?!.*youtube\.com\/iframe)/i,
        /pagead2\.googlesyndication\.com/i,
        /tpc\.googlesyndication\.com/i,
        /pubads\.g\.doubleclick\.net/i,
        /securepubads\.g\.doubleclick\.net/i,
        /gvt\d+\.com\/ads/i,
        /manifest\.googlevideo\.com\/api\/manifest\/ads/i,
        /googlevideo\.com\/videoplayback.*[&?](ctier|oad|adformat)=/i,
        /googlevideo\.com\/initplayback.*[&?](ctier|oad|adformat)=/i,
        /youtube\.com\/pagead/i,
        /youtube\.com\/ptracking/i,
        /youtube\.com\/api\/stats\/(ads|qoe|watchtime|playback)/i,
        /youtubei\/v1\/log_event/i,
        /youtubei\/v1\/player.*adformat/i,
        /youtube\.com\/get_video_info.*adformat/i,
        /youtube\.com\/yva_/i,
        /yt\d?\.ggpht\.com\/ad/i,
        /ytimg\.com\/.*ad/i,
        /yt3\.ggpht\.com\/ytc\/.*ad/i,
        /s0\.2mdn\.net/i,
        /gstaticadssl\.googleapis\.com/i
    ];

    const normalizeUrlString = (candidate) => {
        if (!candidate) return "";
        if (typeof candidate === "string") return candidate;
        if (candidate?.url) return candidate.url;
        if (candidate?.href) return candidate.href;
        return String(candidate);
    };

    const matchesAdUrl = (candidate) => {
        if (!candidate) return false;
        try {
            const ref = normalizeUrlString(candidate);
            if (!ref) return false;
            return blockedPatterns.some((pattern) => pattern.test(ref));
        } catch (err) {
            return false;
        }
    };

    const blockRequest = (label, url) => {
        console.info(`${logPrefix} blocked ${label}: ${url}`);
    };

    const mergeFeatureFlags = (existing = "", forcedFlags = []) => {
        const map = new Map();
        const pushFlag = (flag) => {
            if (!flag) return;
            const [key, value = "true"] = flag.split("=");
            if (!key) return;
            map.set(key.trim(), value.trim());
        };
        existing.split("&").forEach(pushFlag);
        forcedFlags.forEach(pushFlag);
        return [...map.entries()].map(([key, value]) => `${key}=${value}`).join("&");
    };

    const patchFetch = () => {
        if (window.fetch.__ytAdBlockWrapped) return;
        const originalFetch = window.fetch;
        const wrappedFetch = function patchedFetch(resource, init) {
            const target = typeof resource === "string" ? resource : resource?.url;
            if (matchesAdUrl(target)) {
                blockRequest("fetch", target);
                return Promise.resolve(new Response("", { status: 204, statusText: "No Content" }));
            }
            return originalFetch.call(this, resource, init);
        };
        wrappedFetch.__ytAdBlockWrapped = true;
        window.fetch = wrappedFetch;
    };

    const patchXHR = () => {
        if (XMLHttpRequest.prototype.__ytAdBlockWrapped) return;
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
            this.__ytAdBlockUrl = url;
            return originalOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function patchedSend(body) {
            if (matchesAdUrl(this.__ytAdBlockUrl)) {
                blockRequest("xhr", this.__ytAdBlockUrl);
                setTimeout(() => {
                    const errorEvent = new Event("error");
                    this.dispatchEvent(errorEvent);
                    if (typeof this.onerror === "function") {
                        this.onerror(errorEvent);
                    }
                }, 0);
                return undefined;
            }
            return originalSend.apply(this, arguments);
        };

        XMLHttpRequest.prototype.__ytAdBlockWrapped = true;
    };

    const patchSendBeacon = () => {
        if (!navigator.sendBeacon || navigator.sendBeacon.__ytAdBlockWrapped) return;
        const originalSendBeacon = navigator.sendBeacon.bind(navigator);
        const wrappedBeacon = (url, data) => {
            if (matchesAdUrl(url)) {
                blockRequest("beacon", url);
                return true;
            }
            return originalSendBeacon(url, data);
        };
        wrappedBeacon.__ytAdBlockWrapped = true;
        navigator.sendBeacon = wrappedBeacon;
    };

    const patchScriptElements = () => {
        if (!window.HTMLScriptElement || HTMLScriptElement.prototype.__ytAdBlockWrapped) return;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
        if (descriptor?.set) {
            Object.defineProperty(HTMLScriptElement.prototype, "src", {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) {
                    if (matchesAdUrl(value)) {
                        blockRequest("script", value);
                        descriptor.set.call(this, "");
                        return;
                    }
                    descriptor.set.call(this, value);
                }
            });
        }
        const originalSetAttribute = HTMLScriptElement.prototype.setAttribute;
        HTMLScriptElement.prototype.setAttribute = function patchedSetAttribute(name, value) {
            if (typeof name === "string" && name.toLowerCase() === "src" && matchesAdUrl(value)) {
                blockRequest("script", value);
                return undefined;
            }
            return originalSetAttribute.apply(this, arguments);
        };
        HTMLScriptElement.prototype.__ytAdBlockWrapped = true;
    };

    const patchLinkElements = () => {
        if (!window.HTMLLinkElement || HTMLLinkElement.prototype.__ytAdBlockWrapped) return;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href");
        if (descriptor?.set) {
            Object.defineProperty(HTMLLinkElement.prototype, "href", {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) {
                    if (matchesAdUrl(value)) {
                        blockRequest("link", value);
                        descriptor.set.call(this, "about:blank");
                        return;
                    }
                    descriptor.set.call(this, value);
                }
            });
        }
        const originalSetAttribute = HTMLLinkElement.prototype.setAttribute;
        HTMLLinkElement.prototype.setAttribute = function patchedSetAttribute(name, value) {
            if (typeof name === "string" && ["href", "data-href"].includes(name.toLowerCase()) && matchesAdUrl(value)) {
                blockRequest("link", value);
                return undefined;
            }
            return originalSetAttribute.apply(this, arguments);
        };
        HTMLLinkElement.prototype.__ytAdBlockWrapped = true;
    };

    const patchDocumentCreateElement = () => {
        if (Document.prototype.__ytAdBlockWrappedCreateElement) return;
        const originalCreateElement = Document.prototype.createElement;
        Document.prototype.createElement = function patchedCreateElement(tagName, options) {
            const element = originalCreateElement.call(this, tagName, options);
            const upper = typeof tagName === "string" ? tagName.toUpperCase() : "";
            if (upper === "IFRAME") {
                setTimeout(() => sanitizeIframe(element), 0);
            }
            return element;
        };
        Document.prototype.__ytAdBlockWrappedCreateElement = true;
    };

    const patchServiceWorkers = () => {
        const scope = navigator.serviceWorker;
        if (!scope || scope.__ytAdBlockWrapped) return;
        const originalRegister = scope.register.bind(scope);
        scope.register = function patchedRegister(url, options) {
            if (matchesAdUrl(url)) {
                blockRequest("serviceworker", url);
                return Promise.reject(new DOMException("Blocked ad service worker", "SecurityError"));
            }
            return originalRegister(url, options);
        };
        scope.__ytAdBlockWrapped = true;
    };

    const patchWindowOpen = () => {
        if (!window.open || window.open.__ytAdBlockWrapped) return;
        const originalOpen = window.open;
        const wrappedOpen = function patchedOpen(url, target, features) {
            if (matchesAdUrl(url)) {
                blockRequest("window.open", url);
                return null;
            }
            return originalOpen.call(this, url, target, features);
        };
        wrappedOpen.__ytAdBlockWrapped = true;
        window.open = wrappedOpen;
    };

    const patchImageElements = () => {
        if (!window.HTMLImageElement || HTMLImageElement.prototype.__ytAdBlockWrapped) return;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
        if (descriptor && descriptor.set) {
            Object.defineProperty(HTMLImageElement.prototype, "src", {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) {
                    if (matchesAdUrl(value)) {
                        blockRequest("image", value);
                        descriptor.set.call(this, "");
                        return;
                    }
                    descriptor.set.call(this, value);
                }
            });
        }
        const originalSetAttribute = HTMLImageElement.prototype.setAttribute;
        HTMLImageElement.prototype.setAttribute = function patchedSetAttribute(name, value) {
            if (typeof name === "string" && name.toLowerCase() === "src" && matchesAdUrl(value)) {
                blockRequest("image", value);
                return undefined;
            }
            return originalSetAttribute.apply(this, arguments);
        };
        HTMLImageElement.prototype.__ytAdBlockWrapped = true;
    };

    const patchIframeSetter = () => {
        if (!window.HTMLIFrameElement || HTMLIFrameElement.prototype.__ytAdBlockWrapped) return;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
        if (descriptor && descriptor.set) {
            Object.defineProperty(HTMLIFrameElement.prototype, "src", {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: descriptor.get,
                set(value) {
                    const sanitized = sanitizeYoutubeSrc(value);
                    if (sanitized && sanitized !== value) {
                        descriptor.set.call(this, sanitized);
                        return;
                    }
                    if (matchesAdUrl(value)) {
                        blockRequest("iframe", value);
                        descriptor.set.call(this, "about:blank");
                        return;
                    }
                    descriptor.set.call(this, value);
                }
            });
        }
        HTMLIFrameElement.prototype.__ytAdBlockWrapped = true;
    };

    const patchWebSocket = () => {
        if (!window.WebSocket || window.WebSocket.__ytAdBlockWrapped) return;
        const OriginalWebSocket = window.WebSocket;
        const createBlockedSocket = (url) => {
            blockRequest("websocket", url);
            const listeners = new Map();
            const socket = {
                readyState: OriginalWebSocket.CLOSED,
                bufferedAmount: 0,
                extensions: "",
                protocol: "",
                url: normalizeUrlString(url),
                binaryType: "blob",
                addEventListener(type, handler) {
                    if (!listeners.has(type)) listeners.set(type, new Set());
                    if (handler) listeners.get(type).add(handler);
                },
                removeEventListener(type, handler) {
                    listeners.get(type)?.delete(handler);
                },
                dispatchEvent(event) {
                    listeners.get(event.type)?.forEach((fn) => {
                        try {
                            fn.call(this, event);
                        } catch (err) {
                            console.error(err);
                        }
                    });
                    const handlerName = `on${event.type}`;
                    if (typeof this[handlerName] === "function") {
                        this[handlerName](event);
                    }
                    return true;
                },
                close() { },
                send() { }
            };
            setTimeout(() => {
                const errorEvent = new Event("error");
                socket.dispatchEvent(errorEvent);
            }, 0);
            return socket;
        };
        const PatchedWebSocket = function wrappedWebSocket(url, protocols) {
            if (matchesAdUrl(url)) {
                return createBlockedSocket(url);
            }
            return new OriginalWebSocket(url, protocols);
        };
        PatchedWebSocket.prototype = OriginalWebSocket.prototype;
        Object.setPrototypeOf(PatchedWebSocket, OriginalWebSocket);
        PatchedWebSocket.__ytAdBlockWrapped = true;
        window.WebSocket = PatchedWebSocket;
    };

    const patchEventSource = () => {
        if (!window.EventSource || window.EventSource.__ytAdBlockWrapped) return;
        const OriginalEventSource = window.EventSource;
        const PatchedEventSource = function wrappedEventSource(url, config) {
            if (matchesAdUrl(url)) {
                blockRequest("eventsource", url);
                const dummy = {
                    readyState: OriginalEventSource.CLOSED,
                    url: normalizeUrlString(url),
                    withCredentials: Boolean(config?.withCredentials),
                    close() { },
                    addEventListener() { },
                    removeEventListener() { }
                };
                setTimeout(() => {
                    const errorEvent = new Event("error");
                    dummy.onerror?.(errorEvent);
                }, 0);
                return dummy;
            }
            return new OriginalEventSource(url, config);
        };
        PatchedEventSource.prototype = OriginalEventSource.prototype;
        Object.setPrototypeOf(PatchedEventSource, OriginalEventSource);
        PatchedEventSource.__ytAdBlockWrapped = true;
        window.EventSource = PatchedEventSource;
    };

    const patchWorkers = () => {
        const wrapConstructor = (Ctor, label) => {
            if (!Ctor || Ctor.__ytAdBlockWrapped) return;
            const Patched = function wrappedWorker(url, options) {
                if (matchesAdUrl(url)) {
                    blockRequest(label, url);
                    throw new DOMException("Blocked ad worker", "SecurityError");
                }
                return new Ctor(url, options);
            };
            Patched.prototype = Ctor.prototype;
            Object.setPrototypeOf(Patched, Ctor);
            Patched.__ytAdBlockWrapped = true;
            return Patched;
        };

        if (window.Worker) {
            const patchedWorker = wrapConstructor(window.Worker, "worker");
            if (patchedWorker) window.Worker = patchedWorker;
        }
        if (window.SharedWorker) {
            const patchedSharedWorker = wrapConstructor(window.SharedWorker, "sharedworker");
            if (patchedSharedWorker) window.SharedWorker = patchedSharedWorker;
        }
    };

    const sanitizeYoutubeSrc = (src) => {
        if (!src || !/youtu(be\.com|\.be|be-nocookie\.com|be\.googleapis\.com)/i.test(src)) {
            return src;
        }
        try {
            const url = new URL(src, window.location.origin);
            if (/youtu\.be$/i.test(url.hostname)) {
                const videoIdFromPath = url.pathname.replace(/^\//, "");
                url.hostname = "www.youtube-nocookie.com";
                url.pathname = `/embed/${videoIdFromPath}`;
            } else if (/youtube\.com$/i.test(url.hostname) && url.pathname === "/watch") {
                const videoId = url.searchParams.get("v");
                if (videoId) {
                    url.pathname = `/embed/${videoId}`;
                }
            }
            url.hostname = "www.youtube-nocookie.com";
            url.searchParams.set("rel", "0");
            url.searchParams.set("iv_load_policy", "3");
            url.searchParams.set("modestbranding", "1");
            url.searchParams.set("playsinline", "1");
            url.searchParams.set("fs", "0");
            url.searchParams.set("disablekb", "1");
            url.searchParams.set("origin", window.location.origin);
            return url.toString();
        } catch (err) {
            return src;
        }
    };

    const sanitizeIframe = (iframe) => {
        if (!iframe || iframe.__ytAdBlockSanitized) return;
        const currentSrc = iframe.getAttribute("src");
        if (!currentSrc) return;
        if (!/youtu(be\.com|\.be|be-nocookie\.com|be\.googleapis\.com)/i.test(currentSrc)) return;
        const sanitizedSrc = sanitizeYoutubeSrc(currentSrc);
        if (sanitizedSrc && sanitizedSrc !== currentSrc) {
            iframe.setAttribute("src", sanitizedSrc);
        }
        iframe.setAttribute("referrerpolicy", "origin");
        iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
        iframe.__ytAdBlockSanitized = true;
    };

    const observeIframes = () => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes?.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    if (node.tagName === "IFRAME") {
                        sanitizeIframe(node);
                    }
                    node.querySelectorAll?.("iframe").forEach(sanitizeIframe);
                });
                if (mutation.type === "attributes" && mutation.target.tagName === "IFRAME") {
                    sanitizeIframe(mutation.target);
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["src"]
        });
        document.querySelectorAll("iframe").forEach(sanitizeIframe);
    };

    const AD_STATE_CODES = new Set([105, 106, 107, 108, 109, 110, 111]);
    // Inspired by https://github.com/MartinBraquet/youtube-adblock: mute + fast-forward to neutralize stubborn ad slots.
    const MAX_AD_PLAYBACK_RATE = 16;
    const AD_SEEK_COOLDOWN_MS = 600;
    const RELOAD_COOLDOWN_MS = 1500;

    const normalizeVideoDescriptor = (value, fallbackStartSeconds = 0) => {
        if (!value) return null;
        if (typeof value === "string") {
            return { videoId: value, startSeconds: fallbackStartSeconds };
        }
        if (typeof value === "object") {
            const videoId = value.videoId || value.video_id;
            if (!videoId) return null;
            const startSeconds = value.startSeconds ?? value.start ?? value.t ?? fallbackStartSeconds;
            return {
                videoId,
                startSeconds: typeof startSeconds === "number" ? startSeconds : fallbackStartSeconds,
                endSeconds: value.endSeconds ?? value.end,
                suggestedQuality: value.suggestedQuality || value.quality || "default"
            };
        }
        return null;
    };

    const setDesiredVideoDescriptor = (player, descriptor) => {
        if (!player || !descriptor || !descriptor.videoId) return;
        player.__ytDesiredVideo = {
            videoId: descriptor.videoId,
            startSeconds: typeof descriptor.startSeconds === "number" ? descriptor.startSeconds : 0,
            endSeconds: typeof descriptor.endSeconds === "number" ? descriptor.endSeconds : undefined,
            suggestedQuality: descriptor.suggestedQuality || "default"
        };
    };

    const refreshDesiredVideoFromPlayer = (player) => {
        if (!player || typeof player.getVideoData !== "function") return;
        try {
            const data = player.getVideoData();
            if (data && data.video_id && !isAdPlayback(player)) {
                setDesiredVideoDescriptor(player, {
                    videoId: data.video_id,
                    startSeconds: typeof player.getCurrentTime === "function" ? player.getCurrentTime() : 0
                });
            }
        } catch (err) {
            // Ignore read errors
        }
    };

    const getPlayerControlState = (player) => {
        if (!player.__ytAdControlState) {
            player.__ytAdControlState = {
                previousRate: null,
                previousMuted: null,
                lastSeekTimestamp: 0,
                restoreTimer: null
            };
        }
        return player.__ytAdControlState;
    };

    const isAdPlayback = (player) => {
        if (!player) return false;
        try {
            if (typeof player.getAdState === "function" && player.getAdState() === 1) {
                return true;
            }
        } catch (err) {
            // Ignore
        }
        try {
            const state = typeof player.getPlayerState === "function" ? player.getPlayerState() : null;
            return AD_STATE_CODES.has(state);
        } catch (err) {
            return false;
        }
    };

    const suppressAdPlayback = (player) => {
        const controlState = getPlayerControlState(player);
        if (controlState.previousRate === null && typeof player.getPlaybackRate === "function") {
            try {
                controlState.previousRate = player.getPlaybackRate();
            } catch (err) {
                controlState.previousRate = null;
            }
        }
        if (controlState.previousMuted === null && typeof player.isMuted === "function") {
            try {
                controlState.previousMuted = player.isMuted();
            } catch (err) {
                controlState.previousMuted = null;
            }
        }

        if (typeof player.setPlaybackRate === "function") {
            try {
                player.setPlaybackRate(MAX_AD_PLAYBACK_RATE);
            } catch (err) {
                // Ignore
            }
        }
        if (typeof player.mute === "function") {
            try {
                player.mute();
            } catch (err) {
                // Ignore
            }
        }
    };

    const restoreNormalPlayback = (player) => {
        const controlState = getPlayerControlState(player);
        if (controlState.restoreTimer) {
            clearTimeout(controlState.restoreTimer);
        }
        controlState.restoreTimer = setTimeout(() => {
            if (controlState.previousRate !== null && typeof player.setPlaybackRate === "function") {
                try {
                    player.setPlaybackRate(controlState.previousRate);
                } catch (err) {
                    // Ignore
                }
            }
            if (controlState.previousMuted === false) {
                if (typeof player.unMute === "function") {
                    try {
                        player.unMute();
                    } catch (err) {
                        // Ignore
                    }
                } else if (typeof player.setVolume === "function") {
                    try {
                        player.setVolume(100);
                    } catch (err) {
                        // Ignore
                    }
                }
            }
            controlState.previousRate = null;
            controlState.previousMuted = null;
            controlState.restoreTimer = null;
        }, 250);
    };

    const tryReloadVideo = (player) => {
        if (!player || !player.__ytDesiredVideo) return false;
        const lastReload = player.__ytLastReloadTimestamp || 0;
        const now = performance.now();
        if (now - lastReload < RELOAD_COOLDOWN_MS) {
            return false;
        }

        const descriptor = player.__ytDesiredVideo;
        const payload = {
            videoId: descriptor.videoId,
            startSeconds: descriptor.startSeconds || 0,
            endSeconds: descriptor.endSeconds,
            suggestedQuality: descriptor.suggestedQuality || "default"
        };
        try {
            player.__ytLastReloadTimestamp = now;
            if (typeof player.loadVideoById === "function") {
                player.loadVideoById(payload);
                return true;
            }
        } catch (err) {
            // Continue to other fallbacks
        }
        return false;
    };

    const attemptAdSkip = (player) => {
        suppressAdPlayback(player);
        if (typeof player.skipAd === "function") {
            try {
                player.skipAd();
                return;
            } catch (err) {
                // Continue to fallback logic
            }
        }

        const duration = typeof player.getDuration === "function" ? player.getDuration() : null;
        const current = typeof player.getCurrentTime === "function" ? player.getCurrentTime() : null;
        const controlState = getPlayerControlState(player);
        const now = performance.now();

        if (duration && current !== null && duration > 0 && now - controlState.lastSeekTimestamp > AD_SEEK_COOLDOWN_MS) {
            controlState.lastSeekTimestamp = now;
            try {
                player.seekTo(Math.max(duration - 0.1, 0), true);
                return;
            } catch (err) {
                // Ignore and try next fallback
            }
        }

        if (typeof player.nextVideo === "function") {
            try {
                player.nextVideo();
                return;
            } catch (err) {
                // Ignore
            }
        }

        tryReloadVideo(player);
    };

    const attachAdSkipper = (player) => {
        if (!player || player.__ytAdSkipperAttached) return;
        player.__ytAdSkipperAttached = true;

        const syncAdState = () => {
            if (!player) return;
            if (isAdPlayback(player)) {
                attemptAdSkip(player);
            } else {
                restoreNormalPlayback(player);
                refreshDesiredVideoFromPlayer(player);
            }
        };

        if (typeof player.addEventListener === "function") {
            player.addEventListener("onStateChange", syncAdState);
            player.addEventListener("onAdStart", () => attemptAdSkip(player));
            player.addEventListener("onAdEnd", () => {
                restoreNormalPlayback(player);
                refreshDesiredVideoFromPlayer(player);
            });
            player.addEventListener("onError", () => {
                if (!tryReloadVideo(player)) {
                    attemptAdSkip(player);
                }
            });
            player.addEventListener("onApiChange", () => refreshDesiredVideoFromPlayer(player));
            player.addEventListener("onPlaybackQualityChange", () => refreshDesiredVideoFromPlayer(player));
            player.addEventListener("onPlaybackRateChange", () => refreshDesiredVideoFromPlayer(player));
        }

        const pollTimer = setInterval(() => {
            const iframe = typeof player.getIframe === "function" ? player.getIframe() : null;
            if (!iframe || !document.body.contains(iframe)) {
                clearInterval(pollTimer);
                return;
            }
            syncAdState();
        }, 400);

        const originalDestroy = player.destroy;
        if (typeof originalDestroy === "function") {
            player.destroy = function patchedDestroy() {
                clearInterval(pollTimer);
                return originalDestroy.apply(this, arguments);
            };
        }
    };

    const trackVideoRequests = (player, config = {}) => {
        const initialDescriptor = normalizeVideoDescriptor(
            config.videoId ||
            config.video_id ||
            config.playerVars?.videoId ||
            config.playerVars?.video_id ||
            config.video
        );
        if (initialDescriptor) {
            setDesiredVideoDescriptor(player, initialDescriptor);
        }

        const wrap = (method) => {
            const original = player[method];
            if (typeof original !== "function") return;
            player[method] = function wrappedVideoCommand(...args) {
                const descriptor = normalizeVideoDescriptor(args[0], typeof args[1] === "number" ? args[1] : 0);
                if (descriptor) {
                    setDesiredVideoDescriptor(player, descriptor);
                }
                return original.apply(this, args);
            };
        };

        ["loadVideoById", "cueVideoById", "loadPlaylist", "cuePlaylist"].forEach(wrap);
    };

    const patchYouTubePlayer = () => {
        if (!window.YT || !window.YT.Player || window.YT.Player.__ytAdBlockWrapped) {
            setTimeout(patchYouTubePlayer, 500);
            return;
        }

        const OriginalPlayer = window.YT.Player;
        const PatchedPlayer = function patchedPlayer(element, config = {}) {
            const mergedConfig = { ...config };
            mergedConfig.host = "https://www.youtube-nocookie.com";
            const forcedPlayerVars = {
                rel: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                playsinline: 1,
                disablekb: 1,
                fs: 0,
                origin: window.location.origin,
                enablecastapi: 0,
                cc_load_policy: 0,
                hl: navigator.language || "en",
                host_language: navigator.language || "en",
                adformat: "0_0",
                allowfullscreen: 0,
                disable_polymer: 1,
                suppress_ads: 1
            };
            mergedConfig.playerVars = {
                ...forcedPlayerVars,
                ...config.playerVars
            };
            const forcedFeatureFlags = [
                "disable_persistent_ads=true",
                "kevlar_allow_multistep_video_ads=false",
                "enable_desktop_ad_controls=false",
                "html5_disable_ads=true",
                "disable_new_pause_state3_player_ads=true",
                "player_ads_enable_gcf=false",
                "web_player_disable_afa=true",
                "kevlar_miniplayer_play_pause_on_scrim=true",
                "preskip_button_style_ads_backend=false",
                "html5_player_enable_ads_client=false"
            ];
            mergedConfig.playerVars.fflags = mergeFeatureFlags(mergedConfig.playerVars.fflags, forcedFeatureFlags);
            mergedConfig.events = mergedConfig.events || {};
            const originalOnReady = mergedConfig.events.onReady;
            mergedConfig.events.onReady = (event) => {
                attachAdSkipper(event?.target);
                if (typeof originalOnReady === "function") {
                    originalOnReady(event);
                }
            };
            const originalOnStateChange = mergedConfig.events.onStateChange;
            mergedConfig.events.onStateChange = (event) => {
                attachAdSkipper(event?.target);
                if (typeof originalOnStateChange === "function") {
                    return originalOnStateChange(event);
                }
                return undefined;
            };

            const instance = new OriginalPlayer(element, mergedConfig);
            trackVideoRequests(instance, mergedConfig);
            attachAdSkipper(instance);
            return instance;
        };

        PatchedPlayer.prototype = OriginalPlayer.prototype;
        Object.setPrototypeOf(PatchedPlayer, OriginalPlayer);
        PatchedPlayer.__ytAdBlockWrapped = true;
        window.YT.Player = PatchedPlayer;
    };

    const initialize = () => {
        patchFetch();
        patchXHR();
        patchSendBeacon();
        patchScriptElements();
        patchLinkElements();
        patchImageElements();
        patchIframeSetter();
        patchWebSocket();
        patchEventSource();
        patchWorkers();
        patchDocumentCreateElement();
        patchServiceWorkers();
        patchWindowOpen();
        observeIframes();
        patchYouTubePlayer();
        console.log(`${logPrefix} initialized`);
    };

    waitForSpicetify();
})();
