import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const script = read('../core/script.js');

test('weak-password readiness keeps existing login flow unchanged', () => {
  const call = script.indexOf('.signInWithPassword({email, password})');
  assert.ok(call >= 0, 'password login call must remain present');
  const loginStart = script.lastIndexOf('const {error} = await db', call);
  assert.ok(loginStart >= 0, 'login result contract must remain unchanged');
  const loginBlock = script.slice(loginStart, call + 220);
  assert.match(loginBlock, /const \{error\} = await db[\s\S]*\.auth[\s\S]*\.signInWithPassword\(\{email, password\}\)/);
  assert.match(loginBlock, /if \(error\)[\s\S]*throw error/);
  assert.doesNotMatch(loginBlock, /signOut|resetPasswordForEmail|updateUser/);
});

test('auth errors branch on stable weak_password code before message matching', () => {
  assert.match(script, /function translateAuthError\(error = \{\}\)/);
  const start = script.indexOf('function translateAuthError(');
  const end = script.indexOf('\nasync function loadData()', start);
  const block = script.slice(start, end);
  assert.match(block, /error\?\.code/);
  assert.match(block, /code === ['"]weak_password['"]/);
  assert.match(block, /senha[\s\S]*(?:vazada|vazamentos|comprometida)/i);
  assert.match(block, /Invalid login/);
  assert.match(block, /Email not confirmed/);
});

test('all Auth failures pass the full error object to the translator', () => {
  assert.match(script, /catch \(error\) \{[\s\S]*authMessage\(translateAuthError\(error\)\)/);
  assert.doesNotMatch(script, /translateAuthError\(error\.message\)/);
});

test('new-password minimum remains 8 while legacy login is not pre-blocked', () => {
  assert.match(script, /const MIN_NEW_PASSWORD_LENGTH = 8/);
  assert.match(script, /requiresStrongPassword && password\.length < MIN_NEW_PASSWORD_LENGTH/);
  const loginBranch = script.slice(
    script.indexOf("} else {\n            const {error} = await db"),
    script.indexOf("        } catch (error)")
  );
  assert.doesNotMatch(loginBranch, /password\.length < MIN_NEW_PASSWORD_LENGTH/);
});
