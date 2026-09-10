import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = path => fs.existsSync(new URL(path, import.meta.url));

const js = read('../features/automation-center.js');
const index = read('../../index.html');
const cssPath = '../../css/ui-v2/pages/automation.css';
const cssExists = exists(cssPath);
const css = cssExists ? read(cssPath) : '';

test('automation center remains parseable in the browser', () => {
  assert.doesNotThrow(() => new vm.Script(js));
});

test('automation keeps existing persistence, readiness, Meta and retry ownership', () => {
  for (const contract of [
    'function ensureSettings()',
    'function loadMessages()',
    'function loadReadiness()',
    'function retryMessage(button)',
    'const metaConnectionState = messages =>',
    "db.from('automation_settings')",
    "db.from('automation_messages')",
    "db.functions.invoke('retry-automation-message'"
  ]) {
    assert.ok(js.includes(contract), `missing automation contract: ${contract}`);
  }
});

test('automation no longer injects presentation CSS', () => {
  assert.doesNotMatch(js, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(js, /style\.textContent\s*=/);
});

test('automation page owns a semantic UI v2 stylesheet loaded after reports', () => {
  assert.equal(cssExists, true, 'automation.css must exist');
  const reportsIndex = index.indexOf('./css/ui-v2/pages/reports.css');
  const automationIndex = index.indexOf('./css/ui-v2/pages/automation.css');
  assert.ok(automationIndex > reportsIndex, 'automation.css must load after reports.css');
  for (const token of [
    '--surface-card', '--surface-elevated', '--text-primary', '--text-muted',
    '--accent-primary', '--status-success', '--status-warning', '--status-danger'
  ]) {
    assert.ok(css.includes(`var(${token})`), `automation.css must use ${token}`);
  }
  assert.doesNotMatch(css, /background\s*:\s*(?:white|#fff(?:fff)?)(?:\s|;|$)/i);
  assert.doesNotMatch(css, /background\s*:\s*#464646(?:\s|;|$)/i);
});

test('automation exposes geometry-matched loading skeletons', () => {
  for (const contract of ['automation-skeleton', 'automationSkeleton', 'automationContent', 'aria-busy']) {
    assert.ok(js.includes(contract), `missing automation loading contract: ${contract}`);
  }
  assert.match(css, /\.automation-skeleton/);
  assert.match(css, /\.automation-skeleton-stat/);
  assert.match(css, /\.automation-skeleton-setting/);
  assert.match(css, /\.automation-skeleton-row/);
});

test('automation switches and status surfaces are semantic and responsive', () => {
  assert.match(css, /\[data-automation-setting\][\s\S]*appearance\s*:\s*none/s);
  assert.match(css, /\[data-automation-setting\]:checked/);
  assert.match(css, /\.automation-dot\.connected[\s\S]*var\(--status-success\)/s);
  assert.match(css, /\.automation-dot\.waiting[\s\S]*var\(--status-warning\)/s);
  assert.match(css, /\.automation-dot\.problem[\s\S]*var\(--status-danger\)/s);
  assert.match(css, /\.automation-status\.failed[\s\S]*var\(--status-danger\)/s);
  assert.match(css, /@media\s*\(max-width:\s*700px\)[\s\S]*\.automation-row/s);
});

test('refresh and retry keep visible busy states without removing duplicate-submit protection', () => {
  assert.match(js, /automationRefresh[\s\S]*disabled/s);
  assert.match(js, /aria-busy/);
  assert.match(js, /if \(!sourceMessageId \|\| button\.disabled\) return;/);
});
