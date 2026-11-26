import { runWithAbortSignal } from "../../core/abortableOperation.mjs";

export const isSupersededAbort = error => error?.name === 'AbortError' && error.superseded === true;

export function supersededAiRequest(cause) {
    if (isSupersededAbort(cause)) return cause;
    return Object.assign(new Error('AI request superseded', { cause }), { name: 'AbortError', superseded: true });
}

export function throwIfAiRequestSuperseded(signal) {
    if (signal?.aborted) throw supersededAiRequest(signal.reason);
}

export function throwIfAiRequestAborted(signal) {
    if (signal?.aborted) throw signal.reason ?? supersededAiRequest();
}

export function runWithAiRequestSignal(signal, run) {
    return runWithAbortSignal(signal, run, () => signal.reason ?? supersededAiRequest());
}

export async function waitForAiRetry(milliseconds, signal) {
    let timer;
    try {
        await runWithAiRequestSignal(signal, () => new Promise(resolve => { timer = setTimeout(resolve, milliseconds); }));
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

