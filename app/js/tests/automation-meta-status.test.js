const assert = require('node:assert/strict');

const modulePath = require.resolve('../features/automation-center.js');
global.window = {};
global.document = {
    querySelector: () => null,
    getElementById: () => null
};
delete require.cache[modulePath];
require(modulePath);

const {
    metaConnectionState,
    retryMode,
    failureGuidance,
    requiresMetaConfigurationFix
} = global.window.AutomationCenterTest || {};

assert.equal(typeof metaConnectionState, 'function');
assert.equal(typeof retryMode, 'function');
assert.equal(typeof failureGuidance, 'function');
assert.equal(typeof requiresMetaConfigurationFix, 'function');

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
            error_code: '131026',
            error_message: 'Old delivery error'
        }
    ]),
    {
        key: 'connected',
        ok: true,
        title: 'Meta conectada',
        detail: 'Há envio aceito pela API da Meta.'
    }
);

const templateFailure = {
    status: 'failed',
    automation_type: 'payment_voided',
    provider_message_id: null,
    error_code: '132001',
    error_message: '(#132001) Template name does not exist in the translation'
};

assert.equal(requiresMetaConfigurationFix(templateFailure), true);
assert.equal(retryMode(templateFailure), 'after_configuration_fix');
assert.match(failureGuidance(templateFailure), /template/i);
assert.match(failureGuidance(templateFailure), /Meta/i);

assert.deepEqual(
    metaConnectionState([
        {
            status: 'sent',
            provider_message_id: 'wamid.previous-success',
            error_code: null,
            error_message: null
        },
        templateFailure
    ]),
    {
        key: 'problem',
        ok: false,
        title: 'Meta requer atenção',
        detail: 'Há falha de configuração recente. Corrija a integração antes de reenviar.'
    }
);

assert.deepEqual(
    metaConnectionState([
        {
            status: 'failed',
            automation_type: 'payment_voided',
            provider_message_id: null,
            error_code: '132001',
            created_at: '2026-09-21T10:00:00Z'
        },
        {
            status: 'sent',
            automation_type: 'payment_voided',
            provider_message_id: 'wamid.fixed-template',
            error_code: null,
            created_at: '2026-09-22T10:00:00Z'
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
            automation_type: 'payment_voided',
            provider_message_id: null,
            error_code: '190',
            created_at: '2026-09-21T10:00:00Z'
        },
        {
            status: 'sent',
            automation_type: 'payment_confirmation',
            provider_message_id: 'wamid.auth-fixed',
            error_code: null,
            created_at: '2026-09-22T10:00:00Z'
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
        title: 'Meta requer atenção',
        detail: 'Há falha de configuração recente. Corrija a integração antes de reenviar.'
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
