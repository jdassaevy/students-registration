import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const tsSource = fs.readFileSync(
  new URL('../../../supabase/functions/_shared/retry-policy.ts', import.meta.url),
  'utf8',
);
const previousEmitWarning = process.emitWarning;
process.emitWarning = () => {};
const jsSource = stripTypeScriptTypes(tsSource, { mode: 'strip' });
process.emitWarning = previousEmitWarning;
const policy = await import(`data:text/javascript;base64,${Buffer.from(jsSource).toString('base64')}`);

test('known Meta configuration failures are not blindly retried', () => {
  for (const code of ['190', '132000', '132001', '132012']) {
    assert.equal(policy.requiresMetaConfigurationFix(code), true);
    assert.equal(
      policy.retryEligibility({
        ownerMatches: true,
        hasPhone: true,
        hasConsent: true,
        type: 'payment_voided',
        hasRequiredReceipt: true,
        sourceStatus: 'failed',
        errorCode: code,
      }),
      'configuration_fix_required',
    );
    assert.equal(
      policy.retryEligibility({
        ownerMatches: true,
        hasPhone: true,
        hasConsent: true,
        type: 'payment_voided',
        hasRequiredReceipt: true,
        sourceStatus: 'failed',
        errorCode: code,
        configurationFixAcknowledged: true,
      }),
      'eligible',
    );
  }
});

test('successful or pending source messages cannot be retried', () => {
  for (const sourceStatus of ['sent', 'delivered', 'read', 'pending']) {
    assert.equal(
      policy.retryEligibility({
        ownerMatches: true,
        hasPhone: true,
        hasConsent: true,
        type: 'payment_confirmation',
        hasRequiredReceipt: true,
        sourceStatus,
      }),
      'not_failed',
    );
  }
});
