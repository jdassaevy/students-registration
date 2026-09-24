import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { invokeWithSessionRecovery } = require('../features/payment-automation.js');

test('payment lifecycle retries once with a refreshed token after a 401', async () => {
    let invokes = 0;
    let refreshes = 0;

    const result = await invokeWithSessionRecovery({
        invoke: async accessToken => {
            invokes += 1;
            if (invokes === 1) {
                return { data: null, error: { context: { status: 401 } } };
            }

            assert.equal(accessToken, 'fresh-access-token');
            return { data: { action: 'create' }, error: null };
        },
        refreshSession: async () => {
            refreshes += 1;
            return {
                data: { session: { access_token: 'fresh-access-token' } },
                error: null
            };
        }
    });

    assert.equal(invokes, 2);
    assert.equal(refreshes, 1);
    assert.equal(result.error, null);
    assert.equal(result.data.action, 'create');
});

test('non-401 lifecycle failures do not refresh or retry', async () => {
    let invokes = 0;
    let refreshes = 0;
    const originalError = { context: { status: 500 } };

    const result = await invokeWithSessionRecovery({
        invoke: async () => {
            invokes += 1;
            return { data: null, error: originalError };
        },
        refreshSession: async () => {
            refreshes += 1;
            return {
                data: { session: { access_token: 'unused' } },
                error: null
            };
        }
    });

    assert.equal(invokes, 1);
    assert.equal(refreshes, 0);
    assert.equal(result.error, originalError);
});

test('revoked session fails closed without retrying the old token', async () => {
    let invokes = 0;

    const result = await invokeWithSessionRecovery({
        invoke: async () => {
            invokes += 1;
            return { data: null, error: { context: { status: 401 } } };
        },
        refreshSession: async () => ({
            data: { session: null },
            error: { code: 'session_not_found' }
        })
    });

    assert.equal(invokes, 1);
    assert.equal(result.error?.code, 'AUTH_SESSION_EXPIRED');
});
