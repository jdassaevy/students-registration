insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own receipt files" on storage.objects;
create policy "Users read own receipt files"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Uploads e atualizações de PDFs são executados exclusivamente por Edge Functions
-- com service role. O frontend autenticado possui somente leitura dos próprios arquivos.
