-- Repoint the Program Team cross-zone hiring widget to k8_hiring.
-- AOP-origin rows (source='AOP') are the hiring demand raised by ZMs. Same
-- return shape as before (zm_email, status, requests, positions) so the admin
-- page widget needs no code change.
create or replace function public.aop_admin_hiring()
returns table(zm_email text, status text, requests integer, positions integer)
language sql stable security definer set search_path to 'public'
as $function$
  select zm_email,
         coalesce(nullif(btrim(status), ''), 'Requested') as status,
         count(*)::int,
         coalesce(sum(number_of_positions), 0)::int
  from public.k8_hiring
  where source = 'AOP' and zm_email is not null
  group by zm_email, coalesce(nullif(btrim(status), ''), 'Requested');
$function$;
