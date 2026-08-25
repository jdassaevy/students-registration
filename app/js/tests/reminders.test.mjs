import assert from 'node:assert/strict';
import {calculateMonthlyDueDates, reminderTypeForDate, buildReminderCandidates, buildReminderIdempotencyKey} from '../../../supabase/functions/_shared/reminders.js';

assert.deepEqual(
    calculateMonthlyDueDates('2026-01-31', 3),
    ['2026-01-31', '2026-02-28', '2026-03-31']
);
assert.equal(
    reminderTypeForDate('2026-09-10', '2026-09-07'),
    'reminder_before_due'
);
assert.equal(reminderTypeForDate('2026-09-10', '2026-09-10'), 'due_today');
assert.equal(reminderTypeForDate('2026-09-10', '2026-09-13'), 'overdue');
assert.equal(reminderTypeForDate('2026-09-10', '2026-09-11'), null);

const student = {
    id: 's1',
    user_id: 'u1',
    class_id: 'c1',
    person1: 'Ana',
    person2: 'Bruno',
    person1_phone: '5548999999999',
    person2_phone: null,
    person1_whatsapp_consent: true,
    person2_whatsapp_consent: true,
    fees: {
        person1: {
            monthly: 250
        },
        person2: {
            monthly: 250
        }
    },
    payments: {
        person1: [
            false, true, false
        ],
        person2: [false, false, false]
    }
};
const clazz = {
    id: 'c1',
    name: 'Turma A',
    start_date: '2026-09-10'
};
const academy = {
    academy_name: 'Academia A',
    responsible_name: 'Prof. Carlos',
    support_phone: '5548888888888'
};
const candidates = buildReminderCandidates(
    {student, clazz, academy, today: '2026-09-07'}
);
assert.equal(candidates.length, 1);
assert.equal(candidates[0].person, 'person1');
assert.equal(candidates[0].installment, 1);
assert.equal(candidates[0].automationType, 'reminder_before_due');
assert.match(buildReminderIdempotencyKey(candidates[0]), /^reminder:/);

console.log('reminder engine tests passed');
