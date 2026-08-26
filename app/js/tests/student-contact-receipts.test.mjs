import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registration = readFileSync(new URL('../features/registration-ui.js', import.meta.url), 'utf8');
const contact = readFileSync(new URL('../features/student-contact.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../../supabase/migrations/20260826215000_receipts_storage.sql', import.meta.url), 'utf8');

test('student contact module is loaded by the frontend runtime', () => {
  assert.match(registration, /student-contact\.js/);
});

test('student contact module captures phones and whatsapp consent per person', () => {
  for (const token of ['studentPerson1Phone','studentPerson2Phone','studentPerson1Consent','studentPerson2Consent','person1_phone','person2_phone','person1_whatsapp_consent','person2_whatsapp_consent']) {
    assert.match(contact, new RegExp(token));
  }
});

test('receipts storage migration creates a private pdf bucket readable by academy members', () => {
  assert.match(migration, /['"]receipts['"]/);
  assert.match(migration, /public\s*,\s*file_size_limit/);
  assert.match(migration, /application\/pdf/);
  assert.match(migration, /is_academy_member/);
  assert.match(migration, /has_active_support_access/);
});
