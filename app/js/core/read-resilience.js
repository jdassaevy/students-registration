(function (root) {
    const DEFAULT_TIMEOUT_MS = 8000;
    const DEFAULT_RETRIES = 1;
    const DEFAULT_RETRY_DELAY_MS = 250;

    const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

    function timeoutError() {
        const error = new Error('Read request timed out');
        error.code = 'READ_TIMEOUT';
        return error;
    }

    function offlineError() {
        const error = new Error('Browser is offline');
        error.code = 'OFFLINE';
        return error;
    }

    function resultStatus(result) {
        const value = Number(result?.status ?? result?.error?.status ?? 0);
        return Number.isFinite(value) ? value : 0;
    }

    function transientStatus(status) {
        return status === 0 ||
            status === 408 ||
            status === 425 ||
            status === 429 ||
            status >= 500;
    }

    function transientError(error) {
        if (!error)
            return false;
        if (error.code === 'READ_TIMEOUT' || error.code === 'OFFLINE')
            return true;
        const name = String(error.name || '');
        return name === 'TypeError' || name === 'AbortError' || name === 'NetworkError';
    }

    async function withTimeout(factory, timeoutMs) {
        let timer = null;
        try {
            return await Promise.race([
                Promise.resolve().then(factory),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(timeoutError()), timeoutMs);
                })
            ]);
        } finally {
            if (timer)
                clearTimeout(timer);
        }
    }

    async function run(factory, {
        timeoutMs = DEFAULT_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
        retryDelayMs = DEFAULT_RETRY_DELAY_MS
    } = {}) {
        if (typeof factory !== 'function')
            throw new TypeError('Read factory must be a function');

        let attempt = 0;
        while (true) {
            if (root.navigator?.onLine === false)
                throw offlineError();

            try {
                const result = await withTimeout(factory, timeoutMs);
                if (!result?.error)
                    return result;

                if (!transientStatus(resultStatus(result)) || attempt >= retries)
                    return result;
            } catch (error) {
                if (!transientError(error) || attempt >= retries)
                    throw error;
            }

            attempt += 1;
            await sleep(retryDelayMs);
        }
    }

    const api = Object.freeze({
        run,
        transientError,
        transientStatus
    });

    root.ReadResilience = api;

    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
})(
    typeof window !== 'undefined'
        ? window
        : globalThis
);
