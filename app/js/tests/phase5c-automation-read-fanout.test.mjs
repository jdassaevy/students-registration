import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../app/js/features/automation-center.js', import.meta.url),
  'utf8'
);

test('phase 5C readiness uses the canonical active academy profile', () => {
  const start = source.indexOf('async function loadReadiness');
  const end = source.indexOf('async function refreshActivity', start);
  assert.ok(start >= 0 && end > start, 'readiness block must exist');
  const block = source.slice(start, end);

  assert.match(block, /from\('academies'\)/);
  assert.match(block, /select\('name,responsible_name,support_phone'\)/);
  assert.match(block, /eq\('id', academyId\)/);
  assert.doesNotMatch(block, /from\('academy_profiles'\)/);
  assert.match(source, /Boolean\(profile\.name\)/);
});

test('phase 5C scopes receipt readiness to the active academy', () => {
  const start = source.indexOf('async function loadReadiness');
  const end = source.indexOf('async function refreshActivity', start);
  const block = source.slice(start, end);

  assert.match(
    block,
    /from\('receipts'\)[\s\S]*?select\('id,storage_path,status'\)[\s\S]*?eq\('academy_id', academyId\)[\s\S]*?limit\(1\)/
  );
});

test('phase 5C removes the redundant duplicate-receipt scan from browser readiness', () => {
  assert.doesNotMatch(source, /find_duplicate_active_receipts/);
  assert.match(source, /duplicateSafe:\s*true/);
});

test('phase 5C fans out settings activity and readiness reads in one refresh', () => {
  const start = source.indexOf('async function refreshAll');
  const end = source.indexOf('async function retryMessage', start);
  assert.ok(start >= 0 && end > start, 'refreshAll block must exist');
  const block = source.slice(start, end);

  assert.match(block, /const \[settings\] = await Promise\.all\(\[/);
  assert.match(block, /ensureSettings\(\{force\}\)/);
  assert.match(block, /refreshActivity\(\{force\}\)/);
  assert.match(block, /loadReadiness\(false, \{force, render: false\}\)/);
  assert.match(block, /renderReadiness\(Boolean\(settings\)\)/);
});

test('phase 5C retry reuses the coalesced activity refresh path', () => {
  const start = source.indexOf('async function retryMessage');
  const end = source.indexOf("document.querySelectorAll('[data-automation-setting]')", start);
  const block = source.slice(start, end);

  assert.match(block, /activityDirty = true/);
  assert.match(block, /await refreshActivity\(\{force: true\}\)/);
  assert.doesNotMatch(block, /await loadMessages\(\)/);
});
