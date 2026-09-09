-- Permite excluir um aluno/casal sem perder o histórico de recibos.
-- Recibos já emitidos permanecem registrados; apenas o vínculo com o aluno
-- excluído passa a ser nulo.

alter table public.receipts
    alter column student_id drop not null;

alter table public.receipts
    drop constraint if exists receipts_student_id_fkey;

alter table public.receipts
    add constraint receipts_student_id_fkey
    foreign key (student_id)
    references public.students(id)
    on delete set null;
