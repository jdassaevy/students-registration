export function paymentIsMarked(student: any, person: 'person1' | 'person2', kind: 'entry' | 'monthly', installment = 0): boolean {
  if (kind === 'entry') return Boolean(student?.entry_payments?.[person]);
  const index = Number(installment) - 1;
  return index >= 0 && index < 3 && Boolean(student?.payments?.[person]?.[index]);
}

export function paymentAmount(student: any, person: 'person1' | 'person2', kind: 'entry' | 'monthly'): number {
  const value = kind === 'entry' ? student?.fees?.[person]?.entry : student?.fees?.[person]?.monthly;
  return Math.max(0, Number(value) || 0);
}

export function paymentLabel(kind: 'entry' | 'monthly', installment = 0): string {
  return kind === 'entry' ? 'Inscrição' : `${Number(installment)}ª Mensalidade`;
}

export function receiptActionForState({ paid, hasActiveReceipt }: { paid: boolean; hasActiveReceipt: boolean }) {
  if (paid) return hasActiveReceipt ? 'keep' : 'create';
  return hasActiveReceipt ? 'void' : 'none';
}

export function paymentIdentity(studentId: string, person: string, kind: string, installment = 0): string {
  return `${studentId}:${person}:${kind}:${Number(installment) || 0}`;
}

export function receiptNeedsPdf(receipt: any): boolean {
  return receipt?.status === 'active' && !receipt?.storage_path;
}

export function isUniqueViolation(error: any): boolean {
  return error?.code === '23505';
}

export function paymentNotificationAmount(action: string, receipt: any, currentAmount: number): number {
  void action;
  return paymentReceiptAmount(receipt, currentAmount);
}

export function paymentReceiptAmount(receipt: any, currentAmount: number): number {
  const auditedAmount = Number(receipt?.amount);
  if (Number.isFinite(auditedAmount) && auditedAmount >= 0) return auditedAmount;
  return Math.max(0, Number(currentAmount) || 0);
}
