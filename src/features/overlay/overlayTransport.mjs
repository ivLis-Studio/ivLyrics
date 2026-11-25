const PROBE_TIMEOUT_MS = 1500;
const SEND_TIMEOUT_MS = 2000;

export function createOverlayTransport({ maxProbeFailures }) {
    const requestTarget = sender => ({ generation: sender._runtimeGeneration, port: sender.port });
    const isCurrent = (sender, target) => sender.isRuntimeRequestCurrent(target.generation, target.port);

    const probe = async (sender, attempt) => {
        try {
            const response = await fetch(`http://localhost:${attempt.port}${sender.PROBE_ENDPOINT}`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store',
                signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
            });
            if (!isCurrent(sender, attempt)) return false;

            // Older receivers return 404/405 to a probe but still accept POST.
            let protocol = 1;
            if (response.ok && typeof response.json === 'function') {
                try {
                    const status = await response.json();
                    if (Number.isInteger(status?.protocol) && status.protocol > 1) protocol = status.protocol;
                } catch {}
                if (!isCurrent(sender, attempt)) return false;
            }
            sender._receiverReplies += 1;
            sender._receiverProtocol = protocol;
            sender._probeFailures = 0;
            sender.isConnected = true;
            return true;
        } catch {
            if (!isCurrent(sender, attempt)) return false;
            // A successful POST may have re-established the connection while
            // this probe was waiting for its timeout.
            if (sender._receiverReplies !== attempt.replies) return sender.isConnected;
            sender._probeFailures = Math.min(sender._probeFailures + 1, maxProbeFailures);
            sender.isConnected = false;
            return false;
        }
    };

    return {
        checkConnection() {
            const target = requestTarget(this);
            if (!isCurrent(this, target)) return Promise.resolve(false);
            const pending = this._activeProbe;
            if (pending?.generation === target.generation && pending.port === target.port) return pending.promise;

            const attempt = { ...target, replies: this._receiverReplies };
            this._activeProbe = attempt;
            this._lastProbeAt = Date.now();
            attempt.promise = probe(this, attempt).finally(() => {
                if (this._activeProbe === attempt) this._activeProbe = null;
            });
            return attempt.promise;
        },

        async sendToEndpoint(endpoint, data, { receipt = false } = {}) {
            const target = requestTarget(this);
            if (!isCurrent(this, target)) return false;
            const replies = this._receiverReplies;
            const isProgress = endpoint === this.PROGRESS_ENDPOINT;
            try {
                const response = await fetch(`http://localhost:${target.port}${endpoint}`, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                    signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
                });
                if (!isCurrent(this, target)) return false;
                this._receiverReplies += 1;
                if (!response.ok) {
                    let detail = '';
                    try { detail = await response.text(); } catch {}
                    if (!isCurrent(this, target)) return false;
                    if (!isProgress) {
                        console.error('[LyricsService] 가사 전송 실패:', {
                            endpoint, port: target.port, status: response.status, detail: detail || null,
                        });
                    }
                    return false;
                }

                if (!this.isConnected) this.isConnected = true;
                if (receipt && typeof response.json === 'function') {
                    let body;
                    try { body = await response.json(); } catch {}
                    if (!isCurrent(this, target)) return false;
                    if (body && typeof body === 'object') return body;
                }
                return true;
            } catch (error) {
                if (!isCurrent(this, target)) return false;
                if (this.isConnected && this._receiverReplies === replies) this.isConnected = false;
                if (!isProgress) {
                    console.error('[LyricsService] 가사 전송 중 오류:', { endpoint, port: target.port, error });
                }
                return false;
            }
        },
    };
}
