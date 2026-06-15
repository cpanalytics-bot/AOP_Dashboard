-- ===========================================================================
-- Row Level Security for the AOP Platform.
-- Access model:
--   BDA : own records only.
--   BDM : own + records of any descendant in employee_hierarchy.
--   ZDM : own + records of any descendant in employee_hierarchy.
-- Managers cannot self-approve (enforced in app + workflow check below).
-- ===========================================================================

-- Helper: is the given target user the current user or a descendant of them?
create or replace function can_access_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target = auth.uid()
    or exists (
      select 1 from employee_hierarchy h
      where h.ancestor_id = auth.uid()
        and h.descendant_id = target
        and h.depth > 0
    );
$$;

-- Helper: can current user EDIT this user's plan?
-- Same as access for managers; BDAs only edit self.
create or replace function can_edit_user(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target = auth.uid()
    or exists (
      select 1
      from users me
      join employee_hierarchy h on h.ancestor_id = me.id
      where me.id = auth.uid()
        and me.role in ('BDM','ZDM')
        and h.descendant_id = target
        and h.depth > 0
    );
$$;

-- Helper: resolve the owning user_id of an aop.
create or replace function aop_owner(p_aop uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select user_id from aop_master where id = p_aop $$;

-- Enable RLS
alter table users               enable row level security;
alter table territories         enable row level security;
alter table employee_hierarchy  enable row level security;
alter table aop_master          enable row level security;
alter table revenue_targets     enable row level security;
alter table universe_planning   enable row level security;
alter table school_categories   enable row level security;
alter table distributor_planning enable row level security;
alter table sampling_planning   enable row level security;
alter table conversion_planning enable row level security;
alter table training_planning   enable row level security;
alter table investment_planning enable row level security;
alter table hiring_requests     enable row level security;
alter table approval_workflow   enable row level security;
alter table audit_logs          enable row level security;
alter table actuals_tracking    enable row level security;
alter table monthly_reviews     enable row level security;
alter table quarterly_reviews   enable row level security;

-- territories: readable by all authenticated users.
create policy territories_read on territories for select to authenticated using (true);

-- users: can see self + subordinates.
create policy users_read on users for select to authenticated
  using (can_access_user(id));
create policy users_update_self on users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- employee_hierarchy: visible where you are ancestor or descendant.
create policy hierarchy_read on employee_hierarchy for select to authenticated
  using (ancestor_id = auth.uid() or descendant_id = auth.uid());

-- aop_master
create policy aop_read on aop_master for select to authenticated
  using (can_access_user(user_id));
create policy aop_insert on aop_master for insert to authenticated
  with check (can_edit_user(user_id));
create policy aop_update on aop_master for update to authenticated
  using (can_edit_user(user_id)) with check (can_edit_user(user_id));

-- Generic policy generator pattern for child planning tables (aop_id based).
-- (Written explicitly per table for clarity.)
create policy rev_read   on revenue_targets   for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy rev_write  on revenue_targets   for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy uni_read   on universe_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy uni_write  on universe_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy cat_read   on school_categories for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy cat_write  on school_categories for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy dist_read  on distributor_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy dist_write on distributor_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy samp_read  on sampling_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy samp_write on sampling_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy conv_read  on conversion_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy conv_write on conversion_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy train_read  on training_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy train_write on training_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy inv_read   on investment_planning for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy inv_write  on investment_planning for all    to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

-- hiring_requests: managers (BDM/ZDM) create; visible to requester chain.
create policy hiring_read on hiring_requests for select to authenticated
  using (can_access_user(requested_by_user_id));
create policy hiring_insert on hiring_requests for insert to authenticated
  with check (
    requested_by_user_id = auth.uid()
    and exists (select 1 from users where id = auth.uid() and role in ('BDM','ZDM'))
  );
create policy hiring_update on hiring_requests for update to authenticated
  using (can_access_user(requested_by_user_id)) with check (can_access_user(requested_by_user_id));

-- approval_workflow: read within chain; insert only by a manager of the AOP owner
-- (prevents self-approval because aop_owner != approver is required for approve/reject).
create policy approval_read on approval_workflow for select to authenticated
  using (can_access_user(aop_owner(aop_id)));
create policy approval_insert on approval_workflow for insert to authenticated
  with check (
    by_user_id = auth.uid()
    and (
      -- submit/request own draft
      (action = 'submit' and aop_owner(aop_id) = auth.uid())
      -- approve/reject/request_changes only by a manager above the owner
      or (action in ('approve','reject','request_changes')
          and aop_owner(aop_id) <> auth.uid()
          and can_edit_user(aop_owner(aop_id)))
    )
  );

-- actuals / reviews: read within chain, write by managers.
create policy actuals_read on actuals_tracking for select to authenticated using (can_access_user(user_id));
create policy actuals_write on actuals_tracking for all to authenticated using (can_edit_user(user_id)) with check (can_edit_user(user_id));

create policy monthly_read on monthly_reviews for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy monthly_write on monthly_reviews for all to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

create policy quarterly_read on quarterly_reviews for select to authenticated using (can_access_user(aop_owner(aop_id)));
create policy quarterly_write on quarterly_reviews for all to authenticated using (can_edit_user(aop_owner(aop_id))) with check (can_edit_user(aop_owner(aop_id)));

-- audit_logs: readable by managers for their chain; inserts via triggers/service role.
create policy audit_read on audit_logs for select to authenticated
  using (changed_by is null or can_access_user(changed_by));

-- ===========================================================================
-- Edit-lock trigger: block edits to planning tables once AOP is submitted/approved
-- (managers must use 'request_changes' to reopen). Reopening sets status='draft'.
-- ===========================================================================
create or replace function enforce_aop_editable()
returns trigger
language plpgsql
as $$
declare
  st aop_status_t;
begin
  select status into st from aop_master where id = coalesce(NEW.aop_id, OLD.aop_id);
  if st in ('submitted','in_review','approved') then
    raise exception 'AOP is locked (status=%). Request changes before editing.', st;
  end if;
  return NEW;
end;
$$;

create trigger trg_lock_revenue   before insert or update on revenue_targets     for each row execute function enforce_aop_editable();
create trigger trg_lock_universe  before insert or update on universe_planning   for each row execute function enforce_aop_editable();
create trigger trg_lock_categories before insert or update on school_categories  for each row execute function enforce_aop_editable();
create trigger trg_lock_distrib   before insert or update on distributor_planning for each row execute function enforce_aop_editable();
create trigger trg_lock_sampling  before insert or update on sampling_planning   for each row execute function enforce_aop_editable();
create trigger trg_lock_convers   before insert or update on conversion_planning for each row execute function enforce_aop_editable();
create trigger trg_lock_training  before insert or update on training_planning   for each row execute function enforce_aop_editable();
create trigger trg_lock_invest    before insert or update on investment_planning for each row execute function enforce_aop_editable();
