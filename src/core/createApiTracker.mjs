export function createApiTracker({ now = () => Date.now() } = {}) {
    return {
        _logs: [],
        _nextLogId: 0,
        _maxLogs: 100,
        _currentTrackId: null,
        _listeners: [],

        setCurrentTrack(trackId) {
            if (this._currentTrackId !== trackId) {
                this._logs = [];
                this._currentTrackId = trackId;
                this._notifyListeners();
            }
        },

        logRequest(category, endpoint, request = null) {
            const logEntry = {
                id: ++this._nextLogId,
                category,
                endpoint,
                request,
                response: null,
                status: 'pending',
                startTime: now(),
                endTime: null,
                duration: null,
                error: null,
                cached: false
            };

            this._logs.push(logEntry);

            if (this._logs.length > this._maxLogs) {
                this._logs.shift();
            }

            this._notifyListeners();
            return logEntry.id;
        },

        logResponse(logId, response, status = 'success', error = null, cached = false) {
            let entry = null;
            for (let i = this._logs.length - 1; i >= 0; i--) {
                if (this._logs[i].id === logId) {
                    entry = this._logs[i];
                    break;
                }
            }
            if (entry) {
                entry.response = response;
                entry.status = status;
                entry.error = error;
                entry.cached = cached;
                entry.endTime = now();
                entry.duration = entry.endTime - entry.startTime;
                this._notifyListeners();
            }
        },

        cancelRequest(logId) {
            const index = this._logs.findIndex(entry => entry.id === logId && entry.status === 'pending');
            if (index < 0) return;
            this._logs.splice(index, 1);
            this._notifyListeners();
        },

        logCacheHit(category, cacheKey, data) {
            const logEntry = {
                id: ++this._nextLogId,
                category,
                endpoint: `[CACHE] ${cacheKey}`,
                request: null,
                response: data,
                status: 'cached',
                startTime: now(),
                endTime: now(),
                duration: 0,
                error: null,
                cached: true
            };

            this._logs.push(logEntry);

            if (this._logs.length > this._maxLogs) {
                this._logs.shift();
            }

            this._notifyListeners();
        },

        getLogs() {
            return [...this._logs];
        },

        getLogsByCategory(category) {
            return this._logs.filter(l => l.category === category);
        },

        clear() {
            this._logs = [];
            this._notifyListeners();
        },

        addListener(callback) {
            this._listeners.push(callback);
            return () => {
                this._listeners = this._listeners.filter(l => l !== callback);
            };
        },

        _notifyListeners() {
            this._listeners.forEach(cb => {
                try { cb(this._logs); } catch (e) { }
            });
        },

        getSummary() {
            const summary = {
                total: this._logs.length,
                pending: 0,
                success: 0,
                error: 0,
                cached: 0,
                byCategory: {}
            };

            this._logs.forEach(log => {
                if (log.status === 'pending') summary.pending++;
                else if (log.status === 'success') summary.success++;
                else if (log.status === 'error') summary.error++;
                if (log.cached) summary.cached++;

                if (!summary.byCategory[log.category]) {
                    summary.byCategory[log.category] = { total: 0, success: 0, error: 0, cached: 0 };
                }
                summary.byCategory[log.category].total++;
                if (log.status === 'success') summary.byCategory[log.category].success++;
                if (log.status === 'error') summary.byCategory[log.category].error++;
                if (log.cached) summary.byCategory[log.category].cached++;
            });

            return summary;
        }
    };
}
