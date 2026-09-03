export async function requestMonthlyReceiptPdf({
    supabaseUrl,
    anonKey,
    authHeader,
    receiptId,
    fetchImpl = fetch
}) {
    const response = await fetchImpl(`${supabaseUrl}/functions/v1/payment-receipt`, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            apikey: anonKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({receipt_id: receiptId})
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.receipt) {
        const error = new Error(payload?.error || 'Could not generate receipt PDF');
        error.status = response.status;
        throw error;
    }

    return payload.receipt;
}
