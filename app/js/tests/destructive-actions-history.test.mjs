import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const readMaybe = path => {
  try { return read(path); } catch { return ''; }
};

const core = read('../core/script.js');
const receipts = read('../features/receipts.js');
const automation = read('../features/automation-center.js');
const historyVisibility = readMaybe('../features/history-visibility.js');
const migration = readMaybe('../../../supabase/migrations/20260910014500_delete_class_with_students.sql');

test('class deletion is confirmed with affected students and delegated to one atomic RPC', () => {
  assert.match(core, /async function removeClass\s*\(id\)/);
  assert.match(core, /classStudents|affectedStudents|studentsInClass/);
  assert.match(core, /confirm\([\s\S]*aluno/i);
  assert.match(core, /db\s*\.\s*rpc\s*\(\s*['"]delete_class_with_students['"]/);
  assert.doesNotMatch(core, /function removeClass[\s\S]{0,900}\.from\(\s*['"]classes['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.match(core, /couples\s*=\s*couples\.filter\([\s\S]*classId\s*!==\s*id/);
});

test('database migration deletes the class students and class in one authorized transaction', () => {
  assert.ok(migration.length > 0, 'atomic class-delete migration must exist');
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.delete_class_with_students/i);
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /auth\.uid\s*\(\s*\)/i);
  assert.match(migration, /is_academy_member\s*\(/i);
  const studentDelete = migration.search(/delete\s+from\s+public\.students/i);
  const classDelete = migration.search(/delete\s+from\s+public\.classes/i);
  assert.ok(studentDelete >= 0 && classDelete > studentDelete, 'students must be deleted before the class');
  assert.match(migration, /grant\s+execute[\s\S]*authenticated/i);
  assert.match(migration, /revoke\s+all[\s\S]*anon/i);
});

test('history visibility helper persists a per-academy cutoff without deleting records', () => {
  assert.ok(historyVisibility.length > 0, 'history-visibility.js must exist');
  assert.doesNotThrow(() => new vm.Script(historyVisibility, {filename: 'history-visibility.js'}));
  assert.match(historyVisibility, /localStorage/);
  assert.match(historyVisibility, /academyId|academy_id/);
  assert.match(historyVisibility, /created_at/);
  assert.match(historyVisibility, /visibleAfter|visibleItems|filterVisible/);
  assert.doesNotMatch(historyVisibility, /\.delete\s*\(|\.remove\s*\(/);
});

test('financial receipt history can be visually cleared while receipts and PDFs remain stored', () => {
  assert.match(receipts, /id=["']clearReceiptsBtn["']/);
  assert.match(receipts, /DassaevyHistoryVisibility/);
  assert.match(receipts, /confirm\([\s\S]*histórico de recibos/i);
  assert.match(receipts, /currentAcademyId/);
  assert.doesNotMatch(receipts, /\.from\(\s*['"]receipts['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.doesNotMatch(receipts, /storage[\s\S]{0,100}\.remove\s*\(/);
});

test('automation recent activity can be visually cleared without deleting idempotency logs', () => {
  assert.match(automation, /id=["']automationClearHistory["']/);
  assert.match(automation, /DassaevyHistoryVisibility/);
  assert.match(automation, /confirm\([\s\S]*atividade recente/i);
  assert.match(automation, /currentAcademyId/);
  assert.doesNotMatch(automation, /\.from\(\s*['"]automation_messages['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.match(automation, /renderSummary\s*\(\)/);
  assert.match(automation, /renderIntegrationStatus\s*\(\)/);
});
