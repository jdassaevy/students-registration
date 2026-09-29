import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('../core/script.js');
const contact = read('../features/student-whatsapp-contact.js');
const automation = read('../features/automation-center.js');
const reports = read('../features/reports.js');
const receipts = read('../features/receipts.js');
const config = read('../core/supabase-config.js');
const tabBar = read('../features/tab-bar.js');
const index = read('../../index.html');

test('core preserves WhatsApp fields and publishes a tenant-scoped student context', () => {
  for (const field of [
    'person1Phone: row.person1_phone',
    'person2Phone: row.person2_phone',
    'person1WhatsappConsent: Boolean(row.person1_whatsapp_consent)',
    'person2WhatsappConsent: Boolean(row.person2_whatsapp_consent)',
    'person1WhatsappConsentAt: row.person1_whatsapp_consent_at',
    'person2WhatsappConsentAt: row.person2_whatsapp_consent_at'
  ]) {
    assert.ok(core.includes(field), `missing ${field}`);
  }
  assert.match(core, /function publishStudentDataContext\(\)/);
  assert.match(core, /globalThis\.StudentDataContext\s*=\s*\{/);
  assert.match(core, /userId:\s*currentUser\?\.id\s*\|\|\s*null/);
  assert.match(core, /academyId[,}]/);
  assert.match(core, /items:\s*couples\.map/);
  assert.match(core, /globalThis\.publishStudentDataContext\s*=\s*publishStudentDataContext/);
  assert.match(core, /globalThis\.StudentDataContext = null/);
});

test('student contact edit prefers the shared student context and keeps a safe database fallback', () => {
  assert.match(contact, /function sharedStudentContact\(id\)/);
  assert.match(contact, /root\.StudentDataContext/);
  assert.match(contact, /context\?\.userId !== userId/);
  assert.match(contact, /context\?\.academyId !== academyId/);
  assert.match(contact, /const shared = sharedStudentContact\(id\)/);
  assert.match(contact, /shared\s*\?\s*\{ data: shared, error: null \}/);
  assert.match(
    contact,
    /:\s*await db[\s\S]*?\.from\(['"]students['"]\)[\s\S]*?person1_whatsapp_consent_at[\s\S]*?\.eq\(['"]id['"], id\)[\s\S]*?\.single\(\)/
  );
  assert.match(contact, /publishStudentDataContext\?\.\(\)/);
});

test('automation center reuses shared students and only falls back to a students read when unavailable', () => {
  assert.match(automation, /function studentsFromSharedContext\(userId\)/);
  assert.match(automation, /globalThis\.StudentDataContext/);
  assert.match(automation, /context\?\.userId !== userId/);
  assert.match(automation, /const sharedStudents = studentsFromSharedContext\(userId\)/);
  assert.match(automation, /sharedStudents !== null/);
  assert.match(
    automation,
    /\.from\(['"]students['"]\)[\s\S]{0,180}\.select\(['"]id,person1,person2,person1_phone,person2_phone['"]\)/
  );
});

test('reports requests only the payment event fields used by the charts', () => {
  const block = reports.slice(reports.indexOf("from('payment_events')"), reports.indexOf('function destroyCharts'));
  assert.match(block, /\.select\(['"]class_id,paid_at,amount['"]\)/);
  assert.doesNotMatch(block, /\.select\(['"]\*['"]\)/);
});

test('receipt history requests only fields used by history, repair and visibility logic', () => {
  const required = 'id,receipt_number,student_id,person,kind,installment,amount,paid_at,status,storage_path,created_at';
  const block = receipts.slice(receipts.indexOf("from('receipts')"), receipts.indexOf('async invalidate'));
  assert.ok(block.includes(`.select('${required}')`) || block.includes(`.select("${required}")`));
  assert.doesNotMatch(block, /\.select\(['"]\*['"]\)/);
});

test('phase 4T cache keys force the consolidated frontend bundle to refresh', () => {
  assert.match(index, /\.\/js\/core\/supabase-config\.js\?v=5/);
  assert.match(index, /\.\/js\/core\/script\.js\?v=13/);
  assert.match(index, /\.\/js\/features\/reports\.js\?v=6/);
  assert.match(index, /\.\/js\/features\/tab-bar\.js\?v=8/);
  assert.match(config, /student-whatsapp-contact\.js\?v=3/);
  assert.match(config, /receipts\.js\?v=5/);
  assert.match(tabBar, /automation-center\.js\?v=11/);
});
