const SUPABASE_CONFIG = {
    url: 'https://gswcruzlvkcoclbcrjvp.supabase.co',
    publishableKey: 'sb_publishable_jkMQ0iiFYuOwe7VXZiby_A_f1ptfG91'
};

// Executa callbacks de autenticação fora do lock interno do Supabase.
// Isso evita que consultas ao banco iniciadas logo após o login concorram
// com a finalização/persistência da sessão e falhem apenas no primeiro acesso.
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

// Carrega extensões somente depois dos módulos principais,
// garantindo que compartilhem o mesmo estado de turmas, alunos e financeiro.
window.addEventListener('load', () => {
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

    if (document.querySelector('script[data-money-input]')) {
        loadFinancialDetails();
        return;
    }

    const moneyScript = document.createElement('script');
    moneyScript.src = './js/features/money-input.js?v=1';
    moneyScript.dataset.moneyInput = 'true';
    moneyScript.addEventListener('load', loadFinancialDetails, {once: true});
    document.body.appendChild(moneyScript);
});
