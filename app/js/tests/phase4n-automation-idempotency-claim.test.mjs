import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../../supabase/functions/payment-lifecycle/index.ts', import.meta.url),
  'utf8'
);

function functionBlock(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

for (const [name, startMarker, endMarker] of [
  [
    'repair receipt document',
    'async function sendRepairDocument',
    'if (repairEligible && repairMetaReady'
  ],
  [
    'payment automation message',
    'async function sendLogged',
    'const to = eligible && metaReady'
  ]
]) {
  test(`${name} claims idempotency with insert first instead of a preventive read`, () => {
    const block = functionBlock(startMarker, endMarker);

    assert.doesNotMatch(
      block,
      /const\s+\{\s*data:\s*existing\s*\}\s*=\s*await\s+admin\.from\(["']automation_messages["']\)/
    );

    const insert = block.indexOf('.from("automation_messages").insert({');
    const duplicateFallback = block.indexOf('if (logError && isUniqueViolation(logError))');

    assert.ok(insert >= 0, 'automation message insert must remain');
    assert.ok(
      duplicateFallback > insert,
      'unique-violation fallback must remain after the insert'
    );

    const fallback = block.slice(duplicateFallback);
    assert.match(
      fallback,
      /from\(["']automation_messages["']\)\.select\(["']status["']\)/
    );
  });
}

test('payment lifecycle keeps the shared unique-violation helper for concurrent claims', () => {
  assert.match(
    source,
    /import \{[^}]*isUniqueViolation[^}]*\} from ["']\.\.\/_shared\/payment-lifecycle\.ts["']/
  );
});
