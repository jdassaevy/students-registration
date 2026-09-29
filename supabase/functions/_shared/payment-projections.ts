export const RECEIPT_RUNTIME_SELECT =
  "id,user_id,academy_id,student_id,person,kind,installment,amount,paid_at,receipt_number,status,storage_path";

export const PAYMENT_EVENT_RUNTIME_SELECT =
  "academy_id,paid_at";

export const RECEIPT_WITH_CONTEXT_SELECT =
  `${RECEIPT_RUNTIME_SELECT},student_row:students!receipts_student_id_fkey(id,person1,person2,academy_id),class_row:classes!receipts_class_id_fkey(name,academy_id)`;
