export const LYRICS_GENERATION_LOADING_DELAY_MS = 1000;
const COMPLETE_HOLD_MS = 520;
const FAILURE_HOLD_MS = 4000;
const EXIT_MS = 180;

const REQUEST_KINDS = new Map([
  ["lyrics", {}],
  ["pronunciation", { loadingStateKey: "isPhoneticLoading" }],
  ["translation", { loadingStateKey: "isTranslationLoading" }],
  ["cultural-annotations", { loadingStateKey: "isCulturalAnnotationsLoading", delay: 0 }],
  ["word-supplements", {}],
  ["word-sync", { delay: 0, showFailure: true }],
  ["pronunciation-sync", { delay: 0, showFailure: true }],
]);

export function createLyricsGenerationStatusController({ isMounted, setState, scheduleTimer, cancelTimer }) {
  const requests = new Map(Array.from(REQUEST_KINDS.keys(), (kind) => [kind, {
    tokens: new Set(),
    sequence: 0,
    loadingTimer: null,
    hadFailure: false,
    details: null,
  }]));
  const pills = new Map();
  const trackRequests = new Map([
    ["word-sync", new Map()],
    ["pronunciation-sync", new Map()],
  ]);

  function getPill(kind) {
    let pill = pills.get(kind);
    if (!pill) {
      pill = { visible: false, revision: 0, exitTimer: null, removeTimer: null };
      pills.set(kind, pill);
    }
    return pill;
  }

  function cancelTransition(pill) {
    if (pill.exitTimer !== null) cancelTimer(pill.exitTimer);
    if (pill.removeTimer !== null) cancelTimer(pill.removeTimer);
    pill.exitTimer = null;
    pill.removeTimer = null;
  }

  function updatePill(kind, update) {
    setState(previous => {
      const next = update(previous.generationPills?.[kind]);
      if (!next) return null;
      return { generationPills: { ...previous.generationPills, [kind]: next } };
    });
  }

  function show(kind, details = {}) {
    const pill = getPill(kind);
    cancelTransition(pill);
    const revision = ++pill.revision;
    if (!isMounted()) return;
    pill.visible = true;
    updatePill(kind, () => ({
      phase: "loading",
      revision,
      label: details.label || "",
      description: details.description || "",
    }));
  }

  function hide(kind) {
    const pill = getPill(kind);
    cancelTransition(pill);
    const revision = ++pill.revision;
    pill.visible = false;
    if (isMounted()) updatePill(kind, () => ({ phase: "idle", revision }));
  }

  function settle(kind, phase) {
    const pill = getPill(kind);
    if (!pill.visible) {
      hide(kind);
      return;
    }
    cancelTransition(pill);
    const revision = ++pill.revision;
    const holdMs = phase === "failed" ? FAILURE_HOLD_MS : COMPLETE_HOLD_MS;
    if (!isMounted()) return;

    updatePill(kind, current => ({ ...current, phase, revision }));
    pill.exitTimer = scheduleTimer(() => {
      if (!isMounted() || pill.revision !== revision) return;
      pill.exitTimer = null;
      updatePill(kind, current => (
        current?.revision === revision && current.phase === phase
          ? { ...current, phase: phase === "failed" ? "failed-exiting" : "exiting" }
          : null
      ));
    }, holdMs);
    pill.removeTimer = scheduleTimer(() => {
      if (!isMounted() || pill.revision !== revision) return;
      pill.removeTimer = null;
      pill.visible = false;
      updatePill(kind, current => current?.revision === revision ? { phase: "idle", revision } : null);
    }, holdMs + EXIT_MS);
  }

  function isVisible(kind) {
    return pills.get(kind)?.visible === true;
  }

  function cancelLoadingDelay(request) {
    if (request.loadingTimer !== null) cancelTimer(request.loadingTimer);
    request.loadingTimer = null;
  }

  function startRequest(kind, details = {}) {
    const config = REQUEST_KINDS.get(kind);
    const request = requests.get(kind);
    if (!config) return null;

    if (request.tokens.size === 0) {
      request.hadFailure = false;
      request.details = null;
      hide(kind);
    }
    if (details && Object.keys(details).length > 0) request.details = { ...details };
    const token = ++request.sequence;
    request.tokens.add(token);

    cancelLoadingDelay(request);
    const showLoading = () => {
      if (!isMounted() || request.tokens.size === 0) return;
      if (config.loadingStateKey) setState({ [config.loadingStateKey]: true });
      show(kind, request.details || {});
    };
    const delay = config.delay ?? LYRICS_GENERATION_LOADING_DELAY_MS;
    if (delay === 0) {
      showLoading();
    } else {
      const timer = scheduleTimer(() => {
        if (request.loadingTimer !== timer) return;
        request.loadingTimer = null;
        showLoading();
      }, delay);
      request.loadingTimer = timer;
    }

    return token;
  }

  function hasRequests(kind) {
    return (requests.get(kind)?.tokens.size || 0) > 0;
  }

  function startLyricsRequest() {
    requests.get("lyrics").details = null;
    if (hasRequests("lyrics") && isVisible("lyrics")) show("lyrics");
    return startRequest("lyrics");
  }

  function updateRequest(kind, details = {}) {
    if (!hasRequests(kind)) return;
    const request = requests.get(kind);
    request.details = { ...request.details, ...details };
    if (isVisible(kind) && isMounted()) show(kind, request.details);
  }

  function clearRequest(kind, token = null, { completed = false, failed = false, cancelled = false } = {}) {
    const config = REQUEST_KINDS.get(kind);
    const request = requests.get(kind);
    if (!config || (token !== null && !request.tokens.has(token))) return;

    if (token === null) request.tokens.clear();
    else request.tokens.delete(token);
    if (!completed && !cancelled) request.hadFailure = true;
    if (request.tokens.size !== 0) return;

    cancelLoadingDelay(request);
    const shouldComplete = completed && !request.hadFailure && isVisible(kind);
    const shouldFail = config.showFailure && (completed || failed) && request.hadFailure && isVisible(kind);
    request.hadFailure = false;
    request.details = null;
    if (isMounted() && config.loadingStateKey) setState({ [config.loadingStateKey]: false });
    if (shouldComplete) settle(kind, "complete");
    else if (shouldFail) settle(kind, "failed");
    else hide(kind);
  }

  function reportTrackRequest(kind, detail, currentTrackUri, canStart) {
    const tokens = trackRequests.get(kind);
    const { uri, requestId, phase } = detail;
    if (!tokens || !uri || uri !== currentTrackUri || !requestId) return;
    if (phase === "generating") {
      if (tokens.has(requestId) || canStart?.() === false) return;
      tokens.set(requestId, startRequest(kind));
      return;
    }
    if (phase !== "complete" && phase !== "failed" && phase !== "cancelled") return;
    const token = tokens.get(requestId);
    if (token === undefined) return;
    tokens.delete(requestId);
    clearRequest(kind, token, { completed: phase === "complete", failed: phase === "failed", cancelled: phase === "cancelled" });
  }

  function clearTrackRequests(kind) {
    clearRequest(kind);
    trackRequests.get(kind)?.clear();
  }

  function reportMotionStatus(phase) {
    if (phase === "loading") show("motion-direction");
    else if (phase === "complete" || phase === "failed") settle("motion-direction", phase);
    else hide("motion-direction");
  }

  function dispose() {
    for (const request of requests.values()) {
      cancelLoadingDelay(request);
      request.tokens.clear();
      request.details = null;
      request.hadFailure = false;
    }
    for (const tokens of trackRequests.values()) tokens.clear();
    for (const pill of pills.values()) {
      cancelTransition(pill);
      pill.revision++;
      pill.visible = false;
    }
  }

  return {
    startRequest, startLyricsRequest, hasRequests, updateRequest, clearRequest,
    show, hide, settle, isVisible, reportTrackRequest, clearTrackRequests, reportMotionStatus, dispose,
  };
}
