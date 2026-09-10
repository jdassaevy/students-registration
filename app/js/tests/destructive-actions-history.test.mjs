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
const supabaseConfig = read('../core/supabase-config.js');
const classDelete = readMaybe('../features/class-delete.js');
const historyVisibility = readMaybe('../features/history-visibility.js');
const historyControls = readMaybe('../features/history-controls.js');
const historyCss = readMaybe('../../css/ui-v2/pages/history-actions.css');
const migration = readMaybe('../../../supabase/migrations/20260910014500_delete_class_with_students.sql');

test('class deletion is confirmed with affected students and delegated to one atomic RPC', () => {
  assert.ok(classDelete.length > 0, 'class-delete.js must exist');
  assert.doesNotThrow(() => new vm.Script(classDelete, {filename: 'class-delete.js'}));
  assert.match(classDelete, /classStudents/);
  assert.match(classDelete, /affectedStudents/);
  assert.match(classDelete, /aluno/);
  assert.match(classDelete, /confirm\s*\(\s*message\s*\)/);
  assert.match(classDelete, /db\s*\.\s*rpc\s*\(\s*['"]delete_class_with_students['"]/);
  assert.doesNotMatch(classDelete, /\.from\(\s*['"]classes['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.match(classDelete, /couples\s*=\s*couples\.filter\([\s\S]*classId\s*!==\s*id/);
  assert.match(classDelete, /removeClass\s*=\s*deleteClassWithStudents/);
  assert.match(core, /async function removeClass\s*\(id\)/, 'legacy symbol remains available for the wrapper to replace');
});

test('database migration deletes the class students and class in one authorized transaction', () => {
  assert.ok(migration.length > 0, 'atomic class-delete migration must exist');
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.delete_class_with_students/i);
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /auth\.uid\s*\(\s*\)/i);
  assert.match(migration, /is_academy_member\s*\(/i);
  const studentDelete = migration.search(/delete\s+from\s+public\.students/i);
  const classDeleteStatement = migration.search(/delete\s+from\s+public\.classes/i);
  assert.ok(studentDelete >= 0 && classDeleteStatement > studentDelete, 'students must be deleted before the class');
  assert.match(migration, /grant\s+execute[\s\S]*authenticated/i);
  assert.match(migration, /revoke\s+all[\s\S]*anon/i);
});

test('history visibility helper persists a per-academy cutoff without deleting records', () => {
  assert.ok(historyVisibility.length > 0, 'history-visibility.js must exist');
  assert.doesNotThrow(() => new vm.Script(historyVisibility, {filename: 'history-visibility.js'}));
  assert.match(historyVisibility, /localStorage/);
  assert.match(historyVisibility, /academyId|academy_id/);
  assert.match(historyVisibility, /created_at/);
  assert.match(historyVisibility, /visibleAfter/);
  assert.match(historyVisibility, /clearThrough/);
  assert.doesNotMatch(historyVisibility, /\.delete\s*\(|\.remove\s*\(/);
});

test('financial receipt history can be visually cleared while receipts and PDFs remain stored', () => {
  assert.ok(historyControls.length > 0, 'history-controls.js must exist');
  assert.doesNotThrow(() => new vm.Script(historyControls, {filename: 'history-controls.js'}));
  assert.match(historyControls, /['"]clearReceiptsBtn['"]/);
  assert.match(historyControls, /DassaevyHistoryVisibility/);
  assert.match(historyControls, /confirm\([\s\S]*histórico de recibos/i);
  assert.match(historyControls, /currentAcademyId/);
  assert.match(historyControls, /Receipts\?\.items|Receipts\.items/);
  assert.doesNotMatch(historyControls, /\.from\(\s*['"]receipts['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.doesNotMatch(historyControls, /storage[\s\S]{0,100}\.remove\s*\(/);
  assert.match(receipts, /root\.Receipts\s*=\s*api/);
});

test('automation recent activity can be visually cleared without deleting idempotency logs', () => {
  assert.match(historyControls, /['"]automationClearHistory['"]/);
  assert.match(historyControls, /DassaevyHistoryVisibility/);
  assert.match(historyControls, /confirm\([\s\S]*atividade recente/i);
  assert.match(historyControls, /currentAcademyId/);
  assert.doesNotMatch(historyControls, /\.from\(\s*['"]automation_messages['"]\s*\)[\s\S]{0,180}\.delete\s*\(/);
  assert.match(automation, /renderSummary\s*\(\)/);
  assert.match(automation, /renderIntegrationStatus\s*\(\)/);
  assert.match(automation, /idempotency|currentMessages|automation_messages/);
});

test('approved destructive actions are wired after load and keep UI v2 styling external', () => {
  assert.match(supabaseConfig, /history-visibility\.js\?v=1/);
  assert.match(supabaseConfig, /history-controls\.js\?v=1/);
  assert.match(supabaseConfig, /class-delete\.js\?v=1/);
  assert.match(supabaseConfig, /history-actions\.css\?v=1/);
  assert.match(historyCss, /\.history-actions/);
  assert.match(historyCss, /var\(--surface-elevated\)/);
  assert.match(historyCss, /var\(--status-danger\)/);
  assert.doesNotMatch(historyControls, /createElement\(\s*['"]style['"]\s*\)/);
});
