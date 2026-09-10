(function (root) {
    const PREFIX = 'dassaevy-history-cutoff';

    const storage = () => {
        try {
            return root.localStorage || null;
        } catch {
            return null;
        }
    };

    const academyKey = academyId => String(academyId || 'legacy').trim() || 'legacy';
    const storageKey = (scope, academyId) => `${PREFIX}:${String(scope || 'history')}:${academyKey(academyId)}`;

    function recordTimestamp(item = {}) {
        const value = item.created_at || item.paid_at || item.executed_at || item.updated_at || '';
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function readCutoff(scope, academyId) {
        const store = storage();
        if (!store) return 0;
        const value = Number(store.getItem(storageKey(scope, academyId)) || 0);
        return Number.isFinite(value) ? value : 0;
    }

    function writeCutoff(scope, academyId, timestamp) {
        const store = storage();
        const normalized = Math.max(0, Number(timestamp) || 0);
        if (store && normalized) store.setItem(storageKey(scope, academyId), String(normalized));
        return normalized;
    }

    function clearThrough(scope, academyId, items = []) {
        const latest = (Array.isArray(items) ? items : []).reduce(
            (maximum, item) => Math.max(maximum, recordTimestamp(item)),
            0
        );
        return writeCutoff(scope, academyId, Math.max(Date.now(), latest));
    }

    function clearNow(scope, academyId) {
        return writeCutoff(scope, academyId, Date.now());
    }

    function visibleAfter(scope, academyId, items = []) {
        const cutoff = readCutoff(scope, academyId);
        return (Array.isArray(items) ? items : []).filter(item => recordTimestamp(item) > cutoff);
    }

    function isVisibleTimestamp(scope, academyId, timestamp) {
        const value = Number(timestamp) || 0;
        return !value || value > readCutoff(scope, academyId);
    }

    const api = {
        storageKey,
        recordTimestamp,
        readCutoff,
        clearThrough,
        clearNow,
        visibleAfter,
        isVisibleTimestamp
    };

    root.DassaevyHistoryVisibility = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
