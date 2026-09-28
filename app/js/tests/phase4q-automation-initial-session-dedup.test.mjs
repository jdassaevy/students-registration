import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../app/js/features/automation-center.js', import.meta.url),
  'utf8'
);

test('same-user auth events reuse automation cache instead of forcing another full refresh', () => {
  const authStart = source.indexOf('db.auth.onAuthStateChange');
  assert.ok(authStart >= 0, 'automation auth handler must exist');
  const authBlock = source.slice(authStart);

  assert.match(authBlock, /if \(!userChanged\)\s*\{/);
  assert.doesNotMatch(authBlock, /!userChanged\s*&&\s*event\s*!==\s*['"]INITIAL_SESSION['"]/);

  const sameUserStart = authBlock.indexOf('if (!userChanged)');
  const nextDirty = authBlock.indexOf('automationDirty = true', sameUserStart);
  const sameUserBlock = authBlock.slice(sameUserStart, nextDirty);

  assert.match(sameUserBlock, /setTimeout\(\(\) => refreshAll\(\), 0\)/);
  assert.doesNotMatch(sameUserBlock, /refreshAll\(\{force:\s*true\}\)/);
  assert.match(sameUserBlock, /return;/);
});

test('user changes still invalidate automation cache and force fresh tenant data', () => {
  const authStart = source.indexOf('db.auth.onAuthStateChange');
  const authBlock = source.slice(authStart);

  assert.match(authBlock, /automationDirty = true/);
  assert.match(authBlock, /automationLastLoadedAt = 0/);
  assert.match(authBlock, /setTimeout\(\(\) => refreshAll\(\{force:\s*true\}\), 0\)/);
});

test('logout still clears cached automation identity and rendered data inputs', () => {
  const authStart = source.indexOf('db.auth.onAuthStateChange');
  const authBlock = source.slice(authStart);

  assert.match(authBlock, /if \(!nextUserId\)\s*\{/);
  assert.match(authBlock, /currentMessages = \[\]/);
  assert.match(authBlock, /currentStudents = \[\]/);
  assert.match(authBlock, /studentsById\.clear\(\)/);
});
