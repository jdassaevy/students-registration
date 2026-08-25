import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

for (const requiredId of [
  'authView',
  'authForm',
  'authEmail',
  'authPassword',
  'confirmPasswordField',
  'authPasswordConfirmation',
  'forgotPassword',
  'toggleAuthMode'
]) {
  assert.ok(html.includes(`id="${requiredId}"`), `missing auth element: ${requiredId}`);
}

assert.ok(
  html.includes('./assets/images/dassaevy-labs-mark-transparent.png'),
  'login must use the existing Dassaevy Labs logo asset'
);
assert.ok(
  html.includes('./js/features/tab-bar.js?v=1'),
  'animated tab bar script must be loaded without replacing auth markup'
);

console.log('index integrity contract passed');
