import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(
  new URL('../core/script.js', import.meta.url),
  'utf8'
);

test('student search and class filter resolve the current render at event time', () => {
  assert.match(
    core,
    /\$\(['"]search['"]\)\.oninput\s*=\s*\(\)\s*=>\s*render\(\)/,
    'search must call the current render so the mobile cards wrapper also runs'
  );
  assert.match(
    core,
    /\$\(['"]classFilter['"]\)\.onchange\s*=\s*\(\)\s*=>\s*render\(\)/,
    'class filter must call the current render so the mobile cards wrapper also runs'
  );
});
