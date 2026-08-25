import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/profile.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../database/multi-academy-migration.sql', import.meta.url), 'utf8').toLowerCase();

test('profile feature separates academy, responsible and security sections', () => {
    for (const text of ['Dados da academia', 'Professor responsável', 'Segurança']) assert.match(source, new RegExp(text, 'i'));
    for (const id of ['profileAcademyName', 'profileAcademyEmail', 'profileAcademyPhone', 'profileResponsibleName', 'profileResponsiblePhone', 'profileCurrentPassword', 'profileNewPassword', 'profileNewPasswordConfirm']) assert.match(source, new RegExp(id));
});

test('profile supports academy logo upload and removal', () => {
    assert.match(source, /academy-logos/);
    assert.match(source, /profileAcademyLogo/);
    assert.match(source, /removeAcademyLogo/);
});

test('academy logo bucket and storage policies are declared', () => {
    assert.match(migration, /storage\.buckets/);
    assert.match(migration, /academy-logos/);
    assert.match(migration, /storage\.objects/);
    assert.match(migration, /is_academy_owner/);
});
