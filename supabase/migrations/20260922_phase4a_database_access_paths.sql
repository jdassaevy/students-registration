-- Phase 4A: database access-path indexes.
-- Index-only migration: no business rows are inserted, updated or deleted.
-- Existing indexes are intentionally retained; removal is a separate evidence-driven decision.

-- Cover foreign keys flagged by the Supabase performance advisor.
create index if not exists automation_messages_class_id_idx
    on public.automation_messages(class_id);

create index if not exists automation_messages_receipt_id_idx
    on public.automation_messages(receipt_id);

create index if not exists payment_events_class_id_idx
    on public.payment_events(class_id);

create index if not exists receipts_class_id_idx
    on public.receipts(class_id);

-- Cover the recurring tenant-scoped ordered reads observed in pg_stat_statements.
create index if not exists receipts_academy_created_at_idx
    on public.receipts(academy_id, created_at desc);

create index if not exists students_academy_created_at_idx
    on public.students(academy_id, created_at desc);

create index if not exists classes_academy_created_at_idx
    on public.classes(academy_id, created_at asc);

create index if not exists payment_events_academy_paid_at_idx
    on public.payment_events(academy_id, paid_at asc);

create index if not exists automation_messages_academy_created_at_idx
    on public.automation_messages(academy_id, created_at desc);
