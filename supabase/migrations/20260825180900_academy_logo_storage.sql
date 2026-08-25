-- Storage rules for academy logos. Apply after multi-academy-migration.sql.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
    'academy-logos',
    'academy-logos',
    false,
    2097152,
    array['image/png', 'image/jpeg', 'image/webp']
)
on conflict(id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Academy members read logos" on storage.objects;
create policy "Academy members read logos"
on storage.objects for select to authenticated
using(
    bucket_id = 'academy-logos'
    and (
        public.is_academy_member(((storage.foldername(name))[1])::uuid)
        or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
    )
);

drop policy if exists "Academy owners upload logos" on storage.objects;
create policy "Academy owners upload logos"
on storage.objects for insert to authenticated
with check(
    bucket_id = 'academy-logos'
    and (
        public.is_academy_owner(((storage.foldername(name))[1])::uuid)
        or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
    )
);

drop policy if exists "Academy owners update logos" on storage.objects;
create policy "Academy owners update logos"
on storage.objects for update to authenticated
using(
    bucket_id = 'academy-logos'
    and (
        public.is_academy_owner(((storage.foldername(name))[1])::uuid)
        or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
    )
)
with check(
    bucket_id = 'academy-logos'
    and (
        public.is_academy_owner(((storage.foldername(name))[1])::uuid)
        or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
    )
);

drop policy if exists "Academy owners delete logos" on storage.objects;
create policy "Academy owners delete logos"
on storage.objects for delete to authenticated
using(
    bucket_id = 'academy-logos'
    and (
        public.is_academy_owner(((storage.foldername(name))[1])::uuid)
        or public.has_active_support_access(((storage.foldername(name))[1])::uuid)
    )
);
