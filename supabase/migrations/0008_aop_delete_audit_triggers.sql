-- Capture every future row DELETE on the AOP plan tables into
-- public.delete_audit_log (full row in deleted_data jsonb), reusing the existing
-- public.prevent_delete() trigger function. Lets a deleted plan row be restored
-- and records who/when.
--
-- NOTE: row-level DELETE triggers do NOT fire on TRUNCATE, so a TRUNCATE-style
-- reset still bypasses this — pair with a privilege lockdown (revoke anon
-- DELETE/TRUNCATE on aop_* tables) for complete protection.
--
-- Depends on pre-existing public.delete_audit_log + public.prevent_delete().
do $$
declare t text;
begin
  foreach t in array array[
    'aop_master','aop_member','aop_revenue','aop_universe','aop_universe_category',
    'aop_sampling_conversion','aop_training','aop_cost','aop_collection',
    'aop_approval_log','aop_tbh_member','aop_hiring'
  ]
  loop
    if to_regclass('public.'||t) is not null then
      execute format(
        'create or replace trigger aop_audit_delete before delete on public.%I '
        || 'for each row execute function public.prevent_delete()', t);
    end if;
  end loop;
end $$;
