const SUPABASE_CONFIG = {
    url: 'https://gswcruzlvkcoclbcrjvp.supabase.co',
    publishableKey: 'sb_publishable_jkMQ0iiFYuOwe7VXZiby_A_f1ptfG91'
};

if (window.supabase?.createClient) {
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = (...args) => {
        const client = originalCreateClient(...args);
        const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth);
        client.auth.onAuthStateChange = callback => originalOnAuthStateChange((event, session) => {
            setTimeout(() => callback(event, session), 0);
        });
        return client;
    };
}

window.addEventListener('load', () => {
    const loadAcademySettings = () => {
        if (document.querySelector('script[data-academy-settings]')) return;
        const settingsScript = document.createElement('script');
        settingsScript.src = './js/features/academy-settings.js?v=1';
        settingsScript.dataset.academySettings = 'true';
        document.body.appendChild(settingsScript);
    };

    const loadDueDates = () => {
        if (document.querySelector('script[data-due-dates]')) return;
        const dueScript = document.createElement('script');
        dueScript.src = './js/features/due-dates.js?v=1';
        dueScript.dataset.dueDates = 'true';
        document.body.appendChild(dueScript);
    };

    const loadFinancialDetails = () => {
        const existingFinancial = document.querySelector('script[data-financial-details]');
        if (existingFinancial) {
            if (window.DueDates) return;
            existingFinancial.addEventListener('load', loadDueDates, {once: true});
            setTimeout(loadDueDates, 0);
            return;
        }
        const script = document.createElement('script');
        script.src = './js/features/financial-details.js?v=1';
        script.dataset.financialDetails = 'true';
        script.addEventListener('load', loadDueDates, {once: true});
        document.body.appendChild(script);
    };

    const loadReceipts = () => {
        if (document.querySelector('script[data-receipts]')) {
            loadFinancialDetails();
            return;
        }
        const receiptScript = document.createElement('script');
        receiptScript.src = './js/features/receipts.js?v=1';
        receiptScript.dataset.receipts = 'true';
        receiptScript.addEventListener('load', loadFinancialDetails, {once: true});
        document.body.appendChild(receiptScript);
    };

    loadAcademySettings();

    if (document.querySelector('script[data-money-input]')) {
        loadReceipts();
        return;
    }

    const moneyScript = document.createElement('script');
    moneyScript.src = './js/features/money-input.js?v=1';
    moneyScript.dataset.moneyInput = 'true';
    moneyScript.addEventListener('load', loadReceipts, {once: true});
    document.body.appendChild(moneyScript);
});
