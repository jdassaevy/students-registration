import test from 'node:test';
import assert from 'node:assert/strict';
import { requestMonthlyReceiptPdf } from '../../../supabase/functions/_shared/monthly-receipt-delegation.mjs';

test('delegation forwards the original JWT and receipt id', async () => {
    let captured;
    const receipt = await requestMonthlyReceiptPdf({
        supabaseUrl: 'https://example.supabase.co',
        anonKey: 'anon-key',
        authHeader: 'Bearer user-jwt',
        receiptId: 'receipt-123',
        fetchImpl: async (url, options) => {
            captured = {url, options};
            return {
                ok: true,
                status: 200,
                json: async () => ({receipt: {id: 'receipt-123', storage_path: 'u/r.pdf'}})
            };
        }
    });

    assert.equal(captured.url, 'https://example.supabase.co/functions/v1/payment-receipt');
    assert.equal(captured.options.headers.Authorization, 'Bearer user-jwt');
    assert.equal(captured.options.headers.apikey, 'anon-key');
    assert.deepEqual(JSON.parse(captured.options.body), {receipt_id: 'receipt-123'});
    assert.equal(receipt.storage_path, 'u/r.pdf');
});

test('delegation rejects a failed PDF response without hiding the status', async () => {
    await assert.rejects(
        requestMonthlyReceiptPdf({
            supabaseUrl: 'https://example.supabase.co',
            anonKey: 'anon-key',
            authHeader: 'Bearer user-jwt',
            receiptId: 'receipt-123',
            fetchImpl: async () => ({
                ok: false,
                status: 500,
                json: async () => ({error: 'Could not generate receipt PDF'})
            })
        }),
        error => error.message === 'Could not generate receipt PDF' && error.status === 500
    );
});
