import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const index = read('../../index.html');
const layout = read('../../css/ui-v2/layout.css');
const auth = read('../../css/ui-v2/pages/auth.css');

test('shell and auth have dedicated UI v2 styles', () => {
  assert.ok(index.includes('./css/ui-v2/layout.css'));
  assert.ok(index.includes('./css/ui-v2/pages/auth.css'));
});

test('desktop hover never repositions navigation labels or icons', () => {
  assert.doesNotMatch(layout, /view-tab:hover[^\{]*\{[^}]*translateY/s);
  assert.match(layout, /@media[^\{]*max-width:\s*768px[\s\S]*bottom:/s);
});

test('auth uses semantic surfaces and no hardcoded white background', () => {
  assert.match(auth, /var\(--surface-page\)/);
  assert.match(auth, /var\(--surface-input\)/);
  assert.doesNotMatch(auth, /background:\s*(?:white|#fff(?:fff)?)/i);
});
