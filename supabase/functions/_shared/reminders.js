function parseDateOnly(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addMonthsClamped(startDate, months) {
  const start = parseDateOnly(startDate);
  if (!start) return null;
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const day = start.getUTCDate();
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return formatDateOnly(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay))));
}

export function calculateMonthlyDueDates(startDate, count = 3) {
  return Array.from({ length: count }, (_, index) => addMonthsClamped(startDate, index)).filter(Boolean);
}

function dayDiff(fromDate, toDate) {
  const from = parseDateOnly(fromDate);
  const to = parseDateOnly(toDate);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function reminderTypeForDate(dueDate, today) {
  const diff = dayDiff(today, dueDate);
  if (diff === 3) return 'reminder_before_due';
  if (diff === 0) return 'due_today';
  if (diff === -3) return 'overdue';
  return null;
}

function personExists(student, person) {
  return person === 'person1' || Boolean(student.person2);
}

function hasWhatsappEligibility(student, person) {
  return Boolean(student[`${person}_phone`] && student[`${person}_whatsapp_consent`] === true);
}

export function buildReminderIdempotencyKey(candidate) {
  return `reminder:${candidate.studentId}:${candidate.person}:${candidate.installment}:${candidate.automationType}:${candidate.dueDate}`;
}

export function buildReminderCandidates({ student, clazz, academy, today }) {
  if (!clazz?.start_date) return [];
  const dueDates = calculateMonthlyDueDates(clazz.start_date, 3);
  const candidates = [];

  for (const person of ['person1', 'person2']) {
    if (!personExists(student, person) || !hasWhatsappEligibility(student, person)) continue;
    const payments = Array.isArray(student.payments?.[person]) ? student.payments[person] : [];

    dueDates.forEach((dueDate, index) => {
      if (payments[index]) return;
      const automationType = reminderTypeForDate(dueDate, today);
      if (!automationType) return;

      candidates.push({
        userId: student.user_id,
        studentId: student.id,
        classId: student.class_id,
        person,
        studentName: person === 'person2' ? student.person2 : student.person1,
        phone: student[`${person}_phone`],
        installment: index + 1,
        dueDate,
        automationType,
        amount: Number(student.fees?.[person]?.monthly || 0),
        className: clazz.name || '',
        academyName: academy?.academy_name || academy?.display_name || '',
        responsibleName: academy?.responsible_name || '',
        supportPhone: academy?.support_phone || ''
      });
    });
  }

  return candidates;
}
