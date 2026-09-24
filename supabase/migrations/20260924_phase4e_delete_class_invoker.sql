alter function public.delete_class_with_students(uuid) security invoker;

revoke execute on function public.delete_class_with_students(uuid)
from public, anon;

grant execute on function public.delete_class_with_students(uuid)
to authenticated;
