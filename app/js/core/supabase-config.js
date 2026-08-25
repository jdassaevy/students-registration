const SUPABASE_CONFIG = {
    url: 'https://gswcruzlvkcoclbcrjvp.supabase.co',
    publishableKey: 'sb_publishable_jkMQ0iiFYuOwe7VXZiby_A_f1ptfG91'
};

if (window.supabase?.createClient) {
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = (...args) => {
        const client = originalCreateClient(...args);
        const originalOnAuthStateChange = client.auth.onAuthStateChange.bind(client.auth);
        client.auth.onAuthStateChange = callback => originalOnAuthStateChange(
            (event, session) => setTimeout(() => callback(event, session), 0)
        );
        return client;
    };
}

window.addEventListener('load', () => {
    const appendScript = ({src, datasetKey, onload}) => {
        const selector = `script[data-${datasetKey}]`;
        const existing = document.querySelector(selector);
        if (existing) {
            if (onload) existing.addEventListener('load', onload, {once: true});
            return existing;
        }
        const script = document.createElement('script');
        script.src = src;
        script.dataset[datasetKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = 'true';
        if (onload) script.addEventListener('load', onload, {once: true});
        document.body.appendChild(script);
        return script;
    };

    const loadPlatformAdmin = () => {
        if (window.SupportContext || document.querySelector('script[data-platform-admin]')) return;
        appendScript({src: './js/features/platform-admin.js?v=2', datasetKey: 'platform-admin'});
    };

    const loadProfile = () => {
        if (document.querySelector('script[data-profile-feature]')) {
            loadPlatformAdmin();
            return;
        }
        appendScript({
            src: './js/features/profile.js?v=2',
            datasetKey: 'profile-feature',
            onload: loadPlatformAdmin
        });
    };

    const loadProfileOnboarding = () => {
        if (document.querySelector('script[data-profile-onboarding]')) {
            loadProfile();
            return;
        }
        appendScript({
            src: './js/features/profile-onboarding.js?v=2',
            datasetKey: 'profile-onboarding',
            onload: loadProfile
        });
    };

    const loadAcademyContext = () => {
        if (window.AcademyContext) {
            loadProfileOnboarding();
            return;
        }
        appendScript({
            src: './js/core/academy-context.js?v=2',
            datasetKey: 'academy-context',
            onload: loadProfileOnboarding
        });
    };

    const loadAutomationCenter = () => {
        if (document.querySelector('script[data-automation-center]')) return;
        appendScript({src: './js/features/automation-center.js?v=4', datasetKey: 'automation-center'});
    };

    const loadPaymentAutomation = () => {
        if (document.querySelector('script[data-payment-automation]')) return;
        appendScript({src: './js/features/payment-automation.js?v=2', datasetKey: 'payment-automation'});
    };

    const loadDueDates = () => {
        if (document.querySelector('script[data-due-dates]')) return;
        appendScript({src: './js/features/due-dates.js?v=2', datasetKey: 'due-dates'});
    };

    const loadFinancialDetails = () => {
        if (document.querySelector('script[data-financial-details]')) {
            loadDueDates();
            return;
        }
        appendScript({
            src: './js/features/financial-details.js?v=2',
            datasetKey: 'financial-details',
            onload: loadDueDates
        });
    };

    const loadReceipts = () => {
        if (document.querySelector('script[data-receipts]')) {
            loadFinancialDetails();
            return;
        }
        appendScript({
            src: './js/features/receipts.js?v=2',
            datasetKey: 'receipts',
            onload: loadFinancialDetails
        });
    };

    loadAcademyContext();
    loadPaymentAutomation();
    loadAutomationCenter();

    if (document.querySelector('script[data-money-input]')) {
        loadReceipts();
        return;
    }

    appendScript({
        src: './js/features/money-input.js?v=2',
        datasetKey: 'money-input',
        onload: loadReceipts
    });
});
