const updateCheckKey = Symbol.for("ivLyrics.pageUpdateCheck");
const COMPLETE_EVENT = "ivLyrics:update-check-complete";

export function schedulePageUpdateCheck(host, check) {
    if (host[updateCheckKey] !== undefined) return;
    host[updateCheckKey] = new Promise(resolve => host.setTimeout(resolve, 3000))
        .then(check)
        .catch(() => {})
        .finally(() => {
            host[updateCheckKey] = null;
            host.dispatchEvent(new host.CustomEvent(COMPLETE_EVENT));
        });
}

export function waitForPageUpdateCheck(host) {
    return host[updateCheckKey] ?? null;
}
