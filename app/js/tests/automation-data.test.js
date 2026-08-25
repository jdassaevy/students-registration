const assert = require('node:assert/strict');
const {normalizePhone, isWhatsappEligible, resolveConsentTimestamp} = require(
    '../features/academy-settings.js'
);

assert.equal(normalizePhone(''), null);
assert.equal(normalizePhone(null), null);
assert.equal(normalizePhone('(48) 99923-0222'), '5548999230222');
assert.equal(normalizePhone('+55 (48) 99923-0222'), '5548999230222');
assert.equal(normalizePhone('48 3322-4455'), '554833224455');
assert.equal(normalizePhone('123'), null);

assert.equal(isWhatsappEligible(null, true), false);
assert.equal(isWhatsappEligible('5548999230222', false), false);
assert.equal(isWhatsappEligible('5548999230222', true), true);

assert.equal(
    resolveConsentTimestamp(false, false, null, '2026-08-24T12:00:00.000Z'),
    null
);
assert.equal(
    resolveConsentTimestamp(false, true, null, '2026-08-24T12:00:00.000Z'),
    '2026-08-24T12:00:00.000Z'
);
assert.equal(
    resolveConsentTimestamp(true, true, '2026-08-20T12:00:00.000Z', '2026-08-24T12:00:00.000Z'),
    '2026-08-20T12:00:00.000Z'
);
assert.equal(
    resolveConsentTimestamp(true, false, '2026-08-20T12:00:00.000Z', '2026-08-24T12:00:00.000Z'),
    null
);

console.log('automation-data tests passed');
