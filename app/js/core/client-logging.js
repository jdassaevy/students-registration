(() => {
    const clean = value => String(value ?? '')
        .replace(/[^a-zA-Z0-9_.:-]/g, '')
        .slice(0, 64);

    const report = (scope, error) => {
        const safeScope = clean(scope) || 'unknown';
        const code = clean(error?.code || error?.status || error?.name || '');
        console.warn(`[students-registration] ${safeScope}${code ? ` (${code})` : ''}`);
    };

    window.ClientLogging = Object.freeze({report});
})();
