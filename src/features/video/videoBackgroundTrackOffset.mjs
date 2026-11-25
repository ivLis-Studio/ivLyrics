const OFFSET_EVENT = "ivLyrics:offset-changed";

export function watchVideoBackgroundTrackOffset({ host, trackUri, readOffset, publish }) {
    if (!trackUri || typeof readOffset !== "function") return undefined;

    let active = true;
    let receivedLiveOffset = false;
    const update = value => {
        const offset = Number(value);
        publish(Number.isFinite(offset) ? offset : 0);
    };
    function handleChange(event) {
        if (!active || event.detail?.trackUri !== trackUri) return;
        receivedLiveOffset = true;
        update(event.detail.offset);
    }
    host.addEventListener(OFFSET_EVENT, handleChange);

    async function load() {
        let offset = 0;
        try { offset = await readOffset(trackUri); } catch {}
        if (active && !receivedLiveOffset) update(offset);
    }
    void load();
    return () => {
        active = false;
        host.removeEventListener(OFFSET_EVENT, handleChange);
    };
}
