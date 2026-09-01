const SUPABASE_CONFIG = {
    url: 'https://gswcruzlvkcoclbcrjvp.supabase.co',
    publishableKey: 'sb_publishable_jkMQ0iiFYuOwe7VXZiby_A_f1ptfG91'
};

if (
    window.supabase
        ?.createClient
) {
    const originalCreateClient = window
        .supabase
        .createClient
        .bind(window.supabase);
    window.supabase.createClient = (...args) => {
        const client = originalCreateClient(...args);
        const originalOnAuthStateChange = client
            .auth
            .onAuthStateChange
            .bind(client.auth);
        client.auth.onAuthStateChange = callback => originalOnAuthStateChange(
            (event, session) => {
                setTimeout(() => callback(event, session), 0);
            }
        );
        return client;
    };
}

window.addEventListener('load', () => {
    const loadStudentWhatsappContact = () => {
        if (document.querySelector('script[data-student-whatsapp-contact]'))
            return;
        const contactScript = document.createElement('script');
        contactScript.src = './js/features/student-whatsapp-contact.js?v=1';
        contactScript.dataset.studentWhatsappContact = 'true';
        document
            .body
            .appendChild(contactScript);
    };

    const loadAutomationCenter = () => {
        if (document.querySelector('script[data-automation-center]')) 
            return;
        const centerScript = document.createElement('script');
        centerScript.src = './js/features/automation-center.js?v=1';
        centerScript.dataset.automationCenter = 'true';
        document
            .body
            .appendChild(centerScript);
    };

    const loadPaymentAutomation = () => {
        if (document.querySelector('script[data-payment-automation]')) 
            return;
        const automationScript = document.createElement('script');
        automationScript.src = './js/features/payment-automation.js?v=2';
        automationScript.dataset.paymentAutomation = 'true';
        document
            .body
            .appendChild(automationScript);
    };

    const loadDueDates = () => {
        if (document.querySelector('script[data-due-dates]')) 
            return;
        const dueScript = document.createElement('script');
        dueScript.src = './js/features/due-dates.js?v=1';
        dueScript.dataset.dueDates = 'true';
        document
            .body
            .appendChild(dueScript);
    };

    const loadFinancialDetails = () => {
        const existingFinancial = document.querySelector(
            'script[data-financial-details]'
        );
        if (existingFinancial) {
            if (window.DueDates) 
                return;
            existingFinancial.addEventListener('load', loadDueDates, {once: true});
            setTimeout(loadDueDates, 0);
            return;
        }
        const script = document.createElement('script');
        script.src = './js/features/financial-details.js?v=1';
        script.dataset.financialDetails = 'true';
        script.addEventListener('load', loadDueDates, {once: true});
        document
            .body
            .appendChild(script);
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
        document
            .body
            .appendChild(receiptScript);
    };

    loadStudentWhatsappContact();
    loadPaymentAutomation();
    loadAutomationCenter();

    if (document.querySelector('script[data-money-input]')) {
        loadReceipts();
        return;
    }

    const moneyScript = document.createElement('script');
    moneyScript.src = './js/features/money-input.js?v=1';
    moneyScript.dataset.moneyInput = 'true';
    moneyScript.addEventListener('load', loadReceipts, {once: true});
    document
        .body
        .appendChild(moneyScript);
});
