const MAX_NAVIGATION_FRAMES = 12;

export function findSettingsTarget(container, settingKey) {
  const panel = container?.querySelector(".tab-content.active");
  let hiddenMatch = null;
  for (const element of panel?.querySelectorAll("[data-setting-key]") ?? []) {
    if (element.getAttribute("data-setting-key") !== String(settingKey)) continue;
    if (!element.closest?.("[hidden]")) return element;
    hiddenMatch ??= element;
  }
  return hiddenMatch;
}

export function scheduleSettingsDestination({
  destination, isCurrent, readContainer, selectFullscreenView, revealSetting,
  scrollToTarget, requestFrame, cancelFrame, finish,
}) {
  let frame = null;
  let stopped = false;
  let attempts = 0;
  let revealed = false;
  let requestedView = null;

  function tryScroll() {
    frame = null;
    if (stopped || !isCurrent()) return;
    attempts++;
    const container = readContainer();
    const { settingKey, top } = destination;
    if (!settingKey) {
      if (container) {
        container.scrollTo({ top, behavior: "auto" });
        finish();
        return;
      }
    } else {
      const target = findSettingsTarget(container, settingKey);
      const view = target?.closest?.("[data-view][hidden]")?.getAttribute("data-view");
      if (view) {
        if (requestedView !== view) {
          requestedView = view;
          selectFullscreenView(view);
        }
      } else if (!revealed) {
        // Layer tabs need the reveal event even when their anchor already exists.
        revealed = true;
        revealSetting(settingKey);
      } else if (scrollToTarget(target, { behavior: attempts <= 2 ? "smooth" : "auto" })) {
        finish();
        return;
      }
    }

    if (!isCurrent()) return;
    if (attempts < MAX_NAVIGATION_FRAMES) frame = requestFrame(tryScroll);
    else finish();
  }

  frame = requestFrame(tryScroll);
  return () => {
    stopped = true;
    if (frame !== null) cancelFrame(frame);
  };
}
