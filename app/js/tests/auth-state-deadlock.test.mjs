import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const onboardingUrl = new URL('../core/academy-onboarding.js', import.meta.url);
const onboarding = () => fs.readFileSync(onboardingUrl, 'utf8');

test('Supabase auth listener releases its lock before resolving academy or loading app data', () => {
  const source = onboarding();
  const listenerStart = source.indexOf('originalOnAuthStateChange(');
  assert.ok(listenerStart >= 0, 'wrapped onAuthStateChange listener must exist');

  const listener = source.slice(listenerStart);
  assert.doesNotMatch(
    listener,
    /originalOnAuthStateChange\(\s*async\s*\(/,
    'the callback registered directly with Supabase Auth must stay synchronous'
  );
  assert.match(
    listener,
    /setTimeout\s*\(/,
    'academy resolution must be deferred until after the auth callback releases its lock'
  );
});
