export function getNotificationFocusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter(element => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

// Containers that take initial focus can opt into cycling from that position.
export function cycleDialogTabFocus(event, activeElement, focusable, { fallback, containerEdge } = {}) {
    let target;
    if (!focusable.length) {
        target = fallback;
    } else {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const edge = event.shiftKey ? first : last;
        if (activeElement === edge || (containerEdge && activeElement === containerEdge)) {
            target = event.shiftKey ? last : first;
        }
    }
    if (target) {
        event.preventDefault();
        target.focus();
    }
}
