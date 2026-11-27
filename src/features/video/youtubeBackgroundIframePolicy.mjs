const youtubeSrcPattern = /youtu(be\.com|\.be|be-nocookie\.com|be\.googleapis\.com)/i;

export function createYouTubeBackgroundIframePolicy({ host: window, document, moduleState, registerRestore }) {
    const rewriteYoutubeSrc = (src) => {
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
            url.searchParams.set("cc_load_policy", "0");
            url.searchParams.set("origin", window.location.origin);
            return url.toString();
        } catch (err) {
            return src;
        }
    };

    const sanitizeYoutubeSrc = (src) => src && youtubeSrcPattern.test(src) ? rewriteYoutubeSrc(src) : src;

    const sanitizeIframe = (iframe) => {
        if (!iframe || iframe.__ytAdBlockSanitized) return;
        const currentSrc = iframe.getAttribute("src");
        if (!currentSrc || !youtubeSrcPattern.test(currentSrc)) return;
        const sanitizedSrc = rewriteYoutubeSrc(currentSrc);
        if (sanitizedSrc && sanitizedSrc !== currentSrc) {
            iframe.setAttribute("src", sanitizedSrc);
        }
        iframe.setAttribute("referrerpolicy", "origin");
        iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
        iframe.__ytAdBlockSanitized = true;
    };

    const observeIframes = () => {
        if (moduleState.iframeObserver) {
            return;
        }

        const observer = new window.MutationObserver((mutations) => {
            if (!moduleState.initialized) return;
            for (const mutation of mutations) {
                if (mutation.type === "attributes") {
                    if (mutation.target.tagName === "IFRAME") sanitizeIframe(mutation.target);
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== window.Node.ELEMENT_NODE) continue;
                    if (node.tagName === "IFRAME") sanitizeIframe(node);
                    // Most lyric and UI mutations insert leaves. Only subtrees can contain iframes.
                    if (node.childElementCount) node.querySelectorAll("iframe").forEach(sanitizeIframe);
                }
            }
        });
        moduleState.iframeObserver = observer;
        registerRestore("iframe-observer", () => {
            if (moduleState.iframeObserver === observer) {
                observer.disconnect();
                moduleState.iframeObserver = null;
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

    return { sanitizeYoutubeSrc, sanitizeIframe, observeIframes };
}
