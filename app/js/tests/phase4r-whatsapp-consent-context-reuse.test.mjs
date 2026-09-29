import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../app/js/features/student-whatsapp-contact.js', import.meta.url),
  'utf8'
);

test('contact edit load includes consent timestamps and caches that student context', () => {
  assert.match(source, /let loadedContactContext = null/);
  assert.match(
    source,
    /select\(['"]person1_phone,person2_phone,person1_whatsapp_consent,person2_whatsapp_consent,person1_whatsapp_consent_at,person2_whatsapp_consent_at['"]\)/
  );
  assert.match(source, /loadedContactContext = \{ studentId: id, \.\.\.data \}/);
});

test('normal edit save reuses the loaded consent context instead of rereading it', () => {
  assert.match(
    source,
    /loadedContactContext\?\.studentId === id\s*\? \{ data: loadedContactContext, error: null \}/
  );
  assert.match(
    source,
    /:\s*await db\.from\(['"]students['"]\)[\s\S]*?person1_whatsapp_consent_at[\s\S]*?\.eq\(['"]id['"], id\)[\s\S]*?\.single\(\)/
  );
});

test('contact context is cleared for new students and after successful save', () => {
  assert.match(source, /if \(!id\) \{[\s\S]*loadedContactContext = null[\s\S]*return;/);
  assert.match(source, /loadedContactContext = null;[\s\S]*closeDialog\(byId\(['"]modal['"]\)\)/);
});
