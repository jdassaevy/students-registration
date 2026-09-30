import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../../../app/js/core/supabase-config.js', import.meta.url),
  'utf8'
);
const prefix = source.slice(0, source.indexOf('if (\n    window.supabase'));

function runConfig(hostname) {
  const listeners = new Map();
  const context = {
    window: {
      location: { hostname },
      addEventListener(type, callback) {
        listeners.set(type, callback);
      }
    },
    document: { body: { innerHTML: '' } },
    setTimeout,
    console
  };
  context.globalThis = context;
  const script = prefix + `
globalThis.__configResult = {
  config: typeof SUPABASE_CONFIG === 'undefined' ? null : SUPABASE_CONFIG,
  productionHosts: [...SUPABASE_PRODUCTION_HOSTS],
  localHosts: [...SUPABASE_LOCAL_HOSTS]
};`;
  let error = null;
  try {
    vm.runInNewContext(script, context);
  } catch (caught) {
    error = caught;
  }
  return {context, listeners, error};
}

test('official production hosts resolve the production Supabase project', () => {
  for (const hostname of [
    'alunos.dassaevylabs.com.br',
    'students-registration-multi-academy.vercel.app'
  ]) {
    const {context, error} = runConfig(hostname);
    assert.equal(error, null);
    assert.equal(context.__configResult.config.url, 'https://gswcruzlvkcoclbcrjvp.supabase.co');
    assert.match(context.__configResult.config.publishableKey, /^sb_publishable_/);
  }
});

test('local development remains explicitly allowed', () => {
  for (const hostname of ['localhost', '127.0.0.1']) {
    const {context, error} = runConfig(hostname);
    assert.equal(error, null);
    assert.ok(context.__configResult.localHosts.includes(hostname));
  }
});

test('git preview hosts cannot initialize the production Supabase config', () => {
  for (const hostname of [
    'students-registration-git-e153bc-jdassaevy12345-6044s-projects.vercel.app',
    'students-registration-git-random-jdassaevy12345-6044s-projects.vercel.app'
  ]) {
    const {context, error, listeners} = runConfig(hostname);
    assert.ok(error);
    assert.match(String(error.message), /production access blocked/i);
    assert.equal(context.window.__supabaseProductionHostBlocked, true);
    assert.ok(listeners.has('DOMContentLoaded'));
  }
});

test('production host allowlist is exact and has no wildcard Vercel fallback', () => {
  assert.doesNotMatch(source, /endsWith\([^\n]*vercel\.app/);
  assert.doesNotMatch(source, /includes\([^\n]*vercel\.app/);
  assert.doesNotMatch(source, /\*\.vercel\.app/);
  const {context, error} = runConfig('alunos.dassaevylabs.com.br');
  assert.equal(error, null);
  assert.deepEqual(
    Array.from(context.__configResult.productionHosts),
    [
      'alunos.dassaevylabs.com.br',
      'students-registration-multi-academy.vercel.app'
    ]
  );
});
