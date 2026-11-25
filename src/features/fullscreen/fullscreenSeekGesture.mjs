import { getFullscreenSeekPosition } from "./fullscreenPlaybackTiming.mjs";

const readTrack = player => player?.data?.item?.uri || player?.data?.item;

export function createFullscreenSeekGesture({ getPlayer, getPlaybackPosition, setPreview, setProgress }) {
    let drag = null;
    const ownsDrag = ({ player, track }) => getPlayer() === player && readTrack(player) === track;

    function cancel() {
        if (!drag) return;
        const { bar, pointerId } = drag;
        drag = null;
        setPreview(null);
        if (bar.hasPointerCapture?.(pointerId)) bar.releasePointerCapture(pointerId);
    }

    function commit(player, bar, clientX) {
        const position = getFullscreenSeekPosition(bar, clientX, player?.getDuration?.());
        if (position === null || typeof player?.seek !== "function") return;
        getPlaybackPosition()?.clearSafePlayerProgressCorrection?.();
        player.seek(position);
        setProgress(position);
    }

    const handlers = {
        onPointerDown(event) {
            if (drag || event.isPrimary === false || event.button !== 0) return;
            const player = getPlayer();
            const bar = event.currentTarget;
            if (getFullscreenSeekPosition(bar, event.clientX, player?.getDuration?.()) === null) return;
            // Keep the compatibility mouse events used by the control panel's
            // hover hold. Pointer capture handles travel outside the bar.
            drag = { player, track: readTrack(player), bar, pointerId: event.pointerId };
            bar.setPointerCapture?.(event.pointerId);
        },
        onPointerMove(event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (!ownsDrag(drag)) {
                cancel();
                return;
            }
            setPreview(getFullscreenSeekPosition(drag.bar, event.clientX, drag.player?.getDuration?.()));
        },
        onPointerUp(event) {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const current = drag;
            cancel();
            if (ownsDrag(current)) commit(current.player, current.bar, event.clientX);
        },
        onClick(event) {
            // Pointer clicks already committed on release. Keep the non-pointer
            // click path available for hosts that dispatch click directly.
            if (event.detail === 0 && !drag) commit(getPlayer(), event.currentTarget, event.clientX);
        },
    };
    handlers.onLostPointerCapture = handlers.onPointerCancel = (event) => {
        if (drag?.pointerId === event.pointerId) cancel();
    };

    return {
        handlers,
        cancel,
        isDragging() {
            if (drag && !ownsDrag(drag)) cancel();
            return drag !== null;
        },
    };
}
