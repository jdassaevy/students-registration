import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(
    new URL('../../index.html', import.meta.url),
    'utf8'
);

for (
    const requiredId of['authView', 'authForm', 'authEmail', 'authPassword', 'confirmPasswordField', 'authPasswordConfirmation', 'forgotPassword', 'toggleAuthMode']
) {
    assert.ok(
        html.includes(`id="${requiredId}"`),
        `missing auth element: ${requiredId}`
    );
}

assert.ok(
    html.includes('./assets/images/dassaevy-labs-mark-transparent.png'),
    'login must use the existing Dassaevy Labs logo asset'
);
assert.match(
    html,
    /\.\/js\/features\/tab-bar\.js\?v=\d+/,
    'animated tab bar script must be loaded without replacing auth markup'
);

const coreScriptIndex = html.indexOf('./js/core/script.js');
const paymentScriptIndex = html.indexOf('./js/features/payment-automation.js');
assert.ok(paymentScriptIndex > coreScriptIndex, 'payment automation must load after its core dependencies');
assert.match(
    html,
    /<script[^>]+data-payment-automation[^>]+src="\.\/js\/features\/payment-automation\.js\?v=\d+"|<script[^>]+src="\.\/js\/features\/payment-automation\.js\?v=\d+"[^>]+data-payment-automation/,
    'payment automation must be present synchronously and marked against duplicate fallback loading'
);

console.log('index integrity contract passed');
