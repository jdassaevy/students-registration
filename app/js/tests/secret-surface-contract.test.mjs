import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function read(relativePath) {
  return fs.readFileSync(resolve(root, relativePath), 'utf8');
}

function walk(dir) {
  const entries = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === '.git' || item.name === 'node_modules') continue;
    const full = join(dir, item.name);
    if (item.isDirectory()) entries.push(...walk(full));
    else entries.push(full);
  }
  return entries;
}

test('local secret and provider state files are ignored', () => {
  const ignore = read('.gitignore');
  for (const required of [
    '.env',
    '.env.*',
    '!.env.example',
    '.vercel/',
    '.supabase/',
    '*.pem',
    '*.key',
  ]) {
    assert.ok(ignore.split(/\r?\n/).includes(required), `missing .gitignore rule: ${required}`);
  }
});

test('frontend contains only a publishable Supabase key surface', () => {
  const config = read('app/js/core/supabase-config.js');
  assert.match(config, /sb_publishable_[a-z0-9_-]+/i);
  for (const forbidden of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'META_ACCESS_TOKEN',
    'META_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN',
    'AUTOMATION_CRON_SECRET',
  ]) {
    assert.doesNotMatch(config, new RegExp(forbidden, 'i'));
  }
});

test('server secrets are read from Edge Function environment variables', () => {
  const edgeRoot = resolve(root, 'supabase/functions');
  const sources = walk(edgeRoot)
    .filter(path => ['.ts', '.js', '.mjs'].includes(extname(path)))
    .map(path => fs.readFileSync(path, 'utf8'))
    .join('\n');

  for (const name of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'META_ACCESS_TOKEN',
    'META_APP_SECRET',
    'META_WEBHOOK_VERIFY_TOKEN',
    'AUTOMATION_CRON_SECRET',
  ]) {
    assert.match(
      sources,
      new RegExp(`Deno\\.env\\.get\\(["']${name}["']\\)`),
      `${name} must be loaded from the Edge Function environment`,
    );
  }
});

test('tracked text sources contain no high-signal live secret formats', () => {
  const thisFile = resolve(root, 'app/js/tests/secret-surface-contract.test.mjs');
  const textExtensions = new Set([
    '.js', '.mjs', '.ts', '.sql', '.md', '.html', '.json', '.yml', '.yaml', '.css', '.txt',
  ]);
  const patterns = [
    new RegExp('sb_' + 'secret_[A-Za-z0-9_-]{10,}', 'g'),
    new RegExp('re_' + '[A-Za-z0-9_-]{20,}', 'g'),
    new RegExp('github_' + 'pat_[A-Za-z0-9_]{20,}', 'g'),
    new RegExp('ghp_' + '[A-Za-z0-9]{20,}', 'g'),
    new RegExp('EAA' + '[A-Za-z0-9]{40,}', 'g'),
  ];

  for (const file of walk(root)) {
    if (file === thisFile || !textExtensions.has(extname(file))) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      assert.equal(
        match,
        null,
        `possible live secret found in ${relative(root, file)}`,
      );
    }
  }
});
