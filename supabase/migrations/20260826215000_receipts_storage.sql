insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,5242880,array['application/pdf'])
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Academy members read receipts" on storage.objects;
create policy "Academy members read receipts"
on storage.objects for select to authenticated
using(
  bucket_id = 'receipts'
  and (
    public.is_academy_member(((storage.foldername(name))[1])::uuid)
    or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
  )
);
