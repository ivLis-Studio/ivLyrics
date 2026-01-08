// Run "npm i @types/react" to have this type package available in workspace
/// <reference types="react" />
/// <reference path="../../globals.d.ts" />

// Initialize application components
(function() {
  const react = Spicetify.React;

  // Ensure ReactDOM is available
  /** @type {import("react").ReactDOM | null} */
  let reactDOM = Spicetify.ReactDOM;

  function ensureReactDOM() {
    if (
      reactDOM &&
      (typeof reactDOM.render === "function" ||
        typeof reactDOM.createPortal === "function")
    ) {
      return reactDOM;
    }

    const resolved = window?.Spicetify?.ReactDOM || window?.ReactDOM || null;
    if (resolved && resolved !== reactDOM) {
      reactDOM = resolved;
      window.reactDOM = resolved;
    }

    return reactDOM;
  }

  window.ivLyricsEnsureReactDOM = ensureReactDOM;

  // Initialize CacheManager
  if (window.CacheManager && typeof window.CacheManager.init === 'function') {
    window.CacheManager.init();
  }

  // Load Kuromoji library for furigana conversion
  if (typeof window.kuromoji === "undefined") {
    const kuromojiScript = document.createElement("script");
    kuromojiScript.src =
      "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
    kuromojiScript.async = false; // Load synchronously to ensure it's available
    kuromojiScript.onload = () => {
      // Initialize immediately
      if (typeof window.FuriganaConverter !== "undefined") {
        window.FuriganaConverter.init()
          .then(() => {
            // Trigger lyrics re-render if furigana is enabled
            if (CONFIG?.visual?.["furigana-enabled"]) {
              // Try multiple methods to trigger re-render
              if (window.lyricContainer) {
                try {
                  window.lyricContainer.forceUpdate();
                } catch (e) { }
              }
            }
          })
          .catch((err) => { });
      }
    };
    kuromojiScript.onerror = (err) => { };
    document.head.appendChild(kuromojiScript);
  } else {
    // If Kuromoji is already loaded, initialize immediately
    if (typeof window.FuriganaConverter !== "undefined") {
      window.FuriganaConverter.init()
        .then(() => { })
        .catch((err) => { });
    }
  }

  // Define a function called "render" to specify app entry point
  // This function will be used to mount app to main view.
  function render() {
    if (window.LyricsContainer) {
      return react.createElement(window.LyricsContainer, null);
    }
    return react.createElement("div", null, "Loading LyricsContainer...");
  }

  // Export render function for Spicetify
  // Note: Spicetify looks for this function in the main script
  // Since we are not using 'export', we rely on it being global or returned if this was a module.
  // In typical Spicetify extensions, 'render' needs to be top-level.

  // Expose render to global scope just in case
  window.render = render;

})();

// Re-expose render function at top level for Spicetify extension loader
function render() {
  const react = Spicetify.React;
  if (window.LyricsContainer) {
    return react.createElement(window.LyricsContainer, null);
  }
  return react.createElement("div", null, "Loading ivLyrics...");
}
