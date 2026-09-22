import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../../index.html');
const reports = read('../features/reports.js');
const automation = read('../features/automation-center.js');
const tabBar = read('../features/tab-bar.js');

const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';

test('heavy optional features are not downloaded by the initial HTML', () => {
  assert.doesNotMatch(index, /chart\.js@4\.4\.7\/dist\/chart\.umd\.min\.js/);
  assert.doesNotMatch(index, /features\/automation-center\.js/);
  assert.match(tabBar, /createAutomationFallback\(\)/);
  assert.match(tabBar, /script\.src = ['"]\.\/js\/features\/automation-center\.js\?v=4['"]/);
  assert.match(reports, new RegExp(CHART_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('reports cache and deduplicate payment history reads', () => {
  assert.equal((reports.match(/\.from\(['"]payment_events['"]\)/g) || []).length, 1);
  assert.match(reports, /let reportEventsLoaded = false/);
  assert.match(reports, /let reportEventsDirty = true/);
  assert.match(reports, /let reportEventsPromise = null/);
  assert.match(reports, /if \(!force && reportEventsLoaded && !reportEventsDirty\)[\s\S]*return true/);
  assert.match(reports, /if \(reportEventsPromise\)[\s\S]*return reportEventsPromise/);
  assert.match(reports, /onchange = renderReports/);
  assert.match(reports, /payment:lifecycle[\s\S]*reportEventsDirty = true[\s\S]*refreshHistory: true/);
});

test('Chart.js loader is lazy, exact and request-deduplicated', () => {
  assert.match(reports, /const CHART_SCRIPT_URL = ['"]https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.7\/dist\/chart\.umd\.min\.js['"]/);
  assert.match(reports, /if \(chartLoadPromise\)[\s\S]*return chartLoadPromise/);
  assert.match(reports, /script\.src = CHART_SCRIPT_URL/);
  assert.match(reports, /script\.crossOrigin = ['"]anonymous['"]/);
  assert.match(reports, /script\.referrerPolicy = ['"]no-referrer['"]/);
});

test('automation uses one student read for activity names and readiness phones', () => {
  assert.equal((automation.match(/\.from\(['"]students['"]\)/g) || []).length, 1);
  assert.match(automation, /select\(['"]id,person1,person2,person1_phone,person2_phone['"]\)/);
  assert.match(automation, /let currentStudents = \[\]/);
  const readiness = automation.slice(
    automation.indexOf('async function loadReadiness'),
    automation.indexOf('async function refreshAll'),
  );
  assert.doesNotMatch(readiness, /\.from\(['"]students['"]\)/);
  assert.doesNotMatch(readiness, /\.from\(['"]automation_settings['"]\)/);
  assert.match(readiness, /const students = currentStudents/);
  assert.match(readiness, /Boolean\(settingsReady\)/);
});

test('automation refreshes are cached briefly but invalidate on important events', () => {
  assert.match(automation, /const AUTOMATION_CACHE_MS = 30_000/);
  assert.match(automation, /let automationDirty = true/);
  assert.match(automation, /let automationRefreshPromise = null/);
  assert.match(automation, /if \(!force && fresh\)[\s\S]*return true/);
  assert.match(automation, /if \(automationRefreshPromise\)[\s\S]*return automationRefreshPromise/);
  assert.match(automation, /automationRefresh[^\n]*addEventListener\(['"]click['"][\s\S]*force: true/);
  assert.match(automation, /payment:lifecycle[\s\S]*automationDirty = true[\s\S]*force: true/);
  assert.match(automation, /onAuthStateChange[\s\S]*automationDirty = true[\s\S]*automationLastLoadedAt = 0/);
});
