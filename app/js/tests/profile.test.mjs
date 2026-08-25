import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../features/profile.js', import.meta.url), 'utf8');
const storageSql = readFileSync(new URL('../../database/academy-logo-storage.sql', import.meta.url), 'utf8').toLowerCase();

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
    assert.match(storageSql, /storage\.buckets/);
    assert.match(storageSql, /academy-logos/);
    assert.match(storageSql, /storage\.objects/);
    assert.match(storageSql, /is_academy_owner/);
});
