import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const read = relativePath => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const index = read('../../index.html');

const legacyFiles = [
  './css/style.css',
  './css/style-base.css',
  './css/custom-select-fix.css',
  './css/app-shell.css',
  './css/design-tokens.css',
  './css/ui-states.css',
  './css/auth-surface.css',
  './css/academy-profile.css',
  './css/academy-onboarding.css'
];

for (const legacy of legacyFiles) {
  test(`final UI does not load ${legacy}`, () => {
    assert.ok(!index.includes(legacy), `${legacy} is still loaded by index.html`);
  });
}

test('runtime source has no hidden references to retired legacy stylesheets', () => {
  const appRoot = fileURLToPath(new URL('../../', import.meta.url));
  const retired = new Set(legacyFiles.map(item => item.replace(/^\.\//, '')));
  const legacyNames = legacyFiles.map(item => path.basename(item));
  const offenders = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(appRoot, absolute).replaceAll(path.sep, '/');
      if (entry.isDirectory()) {
        if (relative === 'js/tests' || relative.startsWith('js/tests/')) continue;
        walk(absolute);
        continue;
      }
      if (!/\.(?:html|js|css)$/i.test(entry.name) || retired.has(relative)) continue;
      const source = fs.readFileSync(absolute, 'utf8');
      for (const legacyName of legacyNames) {
        if (source.includes(legacyName)) offenders.push(`${relative} -> ${legacyName}`);
      }
    }
  }

  walk(appRoot);
  assert.deepEqual(offenders, [], `legacy runtime references remain:\n${offenders.join('\n')}`);
});

test('dashboard reports and automation inject no presentation CSS', () => {
  for (const relativePath of [
    '../features/dashboard.js',
    '../features/reports.js',
    '../features/automation-center.js'
  ]) {
    const js = read(relativePath);
    assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
    assert.doesNotMatch(js, /style\.textContent\s*=/);
  }
});

test('critical functional modules remain loaded', () => {
  for (const src of [
    './js/core/script.js',
    './js/core/academy-context.js',
    './js/core/academy-data-context.js',
    './js/core/academy-onboarding.js',
    './js/features/payment-automation.js',
    './js/features/dashboard.js',
    './js/features/reports.js',
    './js/features/automation-center.js',
    './js/features/academy-profile.js'
  ]) {
    assert.ok(index.includes(src), `missing ${src}`);
  }
});
