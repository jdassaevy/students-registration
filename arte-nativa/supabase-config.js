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

// Carrega os detalhes financeiros somente depois dos módulos principais,
// garantindo que a visualização agregada e o modal usem os mesmos dados.
window.addEventListener('load', () => {
    if (document.querySelector('script[data-financial-details]')) return;
    const script = document.createElement('script');
    script.src = './financial-details.js?v=1';
    script.dataset.financialDetails = 'true';
    document.body.appendChild(script);
});
