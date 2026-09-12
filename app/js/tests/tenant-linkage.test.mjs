import test from 'node:test';
import assert from 'node:assert/strict';
import {
  receiptMatchesStudent,
  sameAcademy
} from '../../../supabase/functions/_shared/tenant-linkage.mjs';

test('sameAcademy accepts only complete equal academy ids', () => {
  assert.equal(sameAcademy('academy-a', 'academy-a'), true);
  assert.equal(sameAcademy('academy-a', 'academy-b'), false);
  assert.equal(sameAcademy('academy-a', null), false);
  assert.equal(sameAcademy('', 'academy-a'), false);
});

test('receipt must belong to the exact student and academy', () => {
  const student = { id: 'student-a', academy_id: 'academy-a' };

  assert.equal(receiptMatchesStudent({
    student_id: 'student-a', academy_id: 'academy-a'
  }, student), true);

  assert.equal(receiptMatchesStudent({
    student_id: 'student-b', academy_id: 'academy-a'
  }, student), false);

  assert.equal(receiptMatchesStudent({
    student_id: 'student-a', academy_id: 'academy-b'
  }, student), false);

  assert.equal(receiptMatchesStudent({
    student_id: null, academy_id: 'academy-a'
  }, student), false);
});
