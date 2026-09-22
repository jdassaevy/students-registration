import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const deploy = read('../../../.github/workflows/deploy-pages.yml');
const ci = read('../../../.github/workflows/test-dashboard-redesign.yml');
const index = read('../../index.html');
const vercel = JSON.parse(read('../../../vercel.json'));
const clientLogging = read('../core/client-logging.js');

const runtimePaths = [
  '../core/academy-context.js',
  '../core/academy-data-context.js',
  '../core/academy-onboarding.js',
  '../core/script.js',
  '../features/academy-profile.js',
  '../features/academy-settings.js',
  '../features/automation-center.js',
  '../features/class-delete.js',
  '../features/classes-ui.js',
  '../features/custom-select.js',
  '../features/dashboard.js',
  '../features/due-dates.js',
  '../features/financial-details.js',
  '../features/financial-ui.js',
  '../features/history-controls.js',
  '../features/history-visibility.js',
  '../features/money-input.js',
  '../features/payment-automation.js',
  '../features/receipts.js',
  '../features/reports.js',
  '../features/student-whatsapp-contact.js',
  '../features/students-ui.js',
  '../features/tab-bar.js',
  '../features/theme-controller.js',
  '../features/ui-state.js',
];

test('GitHub Actions are pinned by full commit SHA on a fixed runner', () => {
  for (const workflow of [deploy, ci]) {
    assert.match(workflow, /runs-on:\s*ubuntu-24\.04/);
    assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
    for (const match of workflow.matchAll(/uses:\s+[^\s]+@([0-9a-f]{40})/g)) {
      assert.equal(match[1].length, 40);
    }
  }
  assert.match(deploy, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(ci, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/);
  assert.match(ci, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020/);
});

test('checkout does not persist Git credentials in CI or Pages deploy', () => {
  for (const workflow of [deploy, ci]) {
    const checkoutBlocks = [...workflow.matchAll(/uses:\s+actions\/checkout@[0-9a-f]{40}[\s\S]{0,180}?persist-credentials:\s*false/g)];
    assert.ok(checkoutBlocks.length >= 1, 'checkout must disable persisted credentials');
  }
});

test('sanitized client logger loads before application modules', () => {
  const loggerIndex = index.indexOf('./js/core/client-logging.js');
  const onboardingIndex = index.indexOf('./js/core/academy-onboarding.js');
  const coreIndex = index.indexOf('./js/core/script.js');
  assert.ok(loggerIndex >= 0);
  assert.ok(loggerIndex < onboardingIndex);
  assert.ok(loggerIndex < coreIndex);
  assert.match(clientLogging, /replace\(\/\[\^a-zA-Z0-9_.:-\]\//);
  assert.doesNotMatch(clientLogging, /error\?\.message|error\.message/);
});

test('runtime modules do not log raw errors directly', () => {
  for (const path of runtimePaths) {
    const source = read(path);
    assert.doesNotMatch(source, /\bconsole\.(?:log|info|warn|error|debug)\s*\(/, `raw console call in ${path}`);
  }
  assert.match(clientLogging, /console\.warn\(/);
});

test('production HTML is explicitly non-cacheable on Vercel', () => {
  for (const source of ['/', '/index.html']) {
    const rule = vercel.headers?.find(item => item.source === source);
    assert.ok(rule, `missing cache rule for ${source}`);
    const cache = rule.headers?.find(item => item.key.toLowerCase() === 'cache-control')?.value || '';
    assert.match(cache, /no-store/);
    assert.match(cache, /max-age=0/);
  }
});
