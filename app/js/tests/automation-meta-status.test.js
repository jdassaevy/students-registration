const assert = require('node:assert/strict');

const modulePath = require.resolve('../features/automation-center.js');
global.window = {};
global.document = {
    querySelector: () => null,
    getElementById: () => null
};
delete require.cache[modulePath];
require(modulePath);

const {metaConnectionState} = global.window.AutomationCenterTest || {};

assert.equal(
    typeof metaConnectionState,
    'function',
    'automation center must expose the Meta connection state resolver'
);

assert.deepEqual(
    metaConnectionState([
        {
            status: 'sent',
            provider_message_id: 'wamid.test-success',
            error_code: null,
            error_message: null
        },
        {
            status: 'failed',
            provider_message_id: null,
            error_code: '100',
            error_message: 'Old Meta error'
        }
    ]),
    {
        key: 'connected',
        ok: true,
        title: 'Meta conectada',
        detail: 'Há envio aceito pela API da Meta.'
    }
);

assert.deepEqual(
    metaConnectionState([
        {
            status: 'failed',
            provider_message_id: null,
            error_code: '190',
            error_message: 'Meta API authentication error'
        }
    ]),
    {
        key: 'problem',
        ok: false,
        title: 'Meta com problema',
        detail: 'A Meta respondeu com erro. Verifique a integração antes de novos envios.'
    }
);

assert.deepEqual(
    metaConnectionState([]),
    {
        key: 'unvalidated',
        ok: false,
        title: 'Conexão ainda não validada',
        detail: 'Faça um envio para validar a integração com a Meta.'
    }
);

delete global.window;
delete global.document;

console.log('automation Meta status tests passed');
