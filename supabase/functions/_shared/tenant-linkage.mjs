export function sameAcademy(...academyIds) {
  if (!academyIds.length) return false;
  const normalized = academyIds.map(value => String(value || '').trim());
  if (normalized.some(value => !value)) return false;
  return normalized.every(value => value === normalized[0]);
}

export function receiptMatchesStudent(receipt, student) {
  if (!receipt || !student) return false;
  const receiptStudentId = String(receipt.student_id || '').trim();
  const studentId = String(student.id || '').trim();
  if (!receiptStudentId || !studentId || receiptStudentId !== studentId) return false;
  return sameAcademy(receipt.academy_id, student.academy_id);
}
