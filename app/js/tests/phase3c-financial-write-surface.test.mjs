import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reports = fs.readFileSync(
  new URL('../features/reports.js', import.meta.url),
  'utf8',
);

const migration = fs.readFileSync(
  new URL('../../../supabase/migrations/20260922_phase3c_financial_write_surface.sql', import.meta.url),
  'utf8',
).toLowerCase();

const schema = fs.readFileSync(
  new URL('../../database/supabase-schema.sql', import.meta.url),
  'utf8',
).toLowerCase();

test('reports reads payment events but does not write them directly', () => {
  assert.match(reports, /from\(['"]payment_events['"]\)[\s\S]{0,120}\.select\(/);
  assert.doesNotMatch(
    reports,
    /from\(['"]payment_events['"]\)[\s\S]{0,160}\.(?:insert|update|delete)\s*\(/,
  );
  assert.match(reports, /addEventListener\(['"]payment:lifecycle['"]/);
});

test('Phase 3C revokes browser writes to financial audit tables', () => {
  assert.match(
    migration,
    /revoke insert, update, delete on public\.payment_events from authenticated/,
  );
  assert.match(
    migration,
    /revoke insert, update on public\.receipts from authenticated/,
  );
  assert.match(migration, /grant select on public\.payment_events to authenticated/);
  assert.match(migration, /grant select on public\.receipts to authenticated/);
});

test('canonical schema keeps payment events and receipts client read-only', () => {
  assert.match(schema, /grant select on public\.payment_events to authenticated/);
  assert.match(schema, /grant select on public\.receipts to authenticated/);
  assert.doesNotMatch(
    schema,
    /grant select, insert, update, delete on public\.payment_events to authenticated/,
  );
  assert.doesNotMatch(
    schema,
    /grant select, insert, update on public\.receipts to authenticated/,
  );
});
