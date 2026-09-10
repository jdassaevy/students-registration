import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core = fs.readFileSync(new URL('../core/script.js', import.meta.url), 'utf8');
const studentsUi = fs.readFileSync(new URL('../features/students-ui.js', import.meta.url), 'utf8');
const start = core.indexOf('function openDialog');
const end = core.indexOf('function animateView');
const dialogFunctions = core.slice(start, end);
const guardStart = studentsUi.indexOf('// DIALOG_LIFECYCLE_GUARD_START');
const guardEnd = studentsUi.indexOf('// DIALOG_LIFECYCLE_GUARD_END');
const dialogGuard = studentsUi.slice(guardStart, guardEnd);

function loadDialogFunctions() {
  const timers = [];
  const context = {
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    }
  };

  vm.createContext(context);
  vm.runInContext(`${dialogFunctions}\n${dialogGuard}\nthis.openDialog = openDialog; this.closeDialog = closeDialog;`, context);
  return { ...context, timers };
}

function fakeDialog() {
  const listeners = new Map();
  return {
    open: false,
    classList: {
      add() {},
      remove() {},
      contains() { return false; }
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type) { listeners.get(type)?.(); }
  };
}

test('an old close fallback cannot close a dialog that was reopened', () => {
  const { openDialog, closeDialog, timers } = loadDialogFunctions();
  const dialog = fakeDialog();

  openDialog(dialog);
  closeDialog(dialog);

  dialog.fire('transitionend');
  assert.equal(dialog.open, false, 'first modal session should finish closing');

  openDialog(dialog);
  assert.equal(dialog.open, true, 'new modal session should be open');

  timers.forEach(run => run());
  assert.equal(dialog.open, true, 'stale close fallback must not close the reopened modal');
});
