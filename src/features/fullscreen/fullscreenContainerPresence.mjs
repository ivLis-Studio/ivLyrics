const FULLSCREEN_CONTAINER_BODY_CLASS = "ivlyrics-fullscreen-container-mounted";
// Mirroring presence on the body avoids global style invalidations from :has().
export function watchFullscreenContainerBodyClass(document, Observer) {
  const body = document?.body;
  if (!body || typeof Observer === "undefined" || body.ivlyricsFullscreenContainerObserver) return;
  const sync = () => body.classList.toggle(
    FULLSCREEN_CONTAINER_BODY_CLASS,
    !!document.getElementById("lyrics-fullscreen-container")
  );
  // The container is only ever appended to <body> itself.
  body.ivlyricsFullscreenContainerObserver = new Observer(sync);
  body.ivlyricsFullscreenContainerObserver.observe(body, { childList: true });
  sync();
}
