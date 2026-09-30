-- ============================================================
-- User Activity & System Monitoring Module
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ============================================================
-- 1. TABLES
-- ============================================================

create table if not exists public.activity_page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  route text,
  module text,
  page_title text,
  session_id text,
  branch_id uuid,
  started_at timestamp with time zone default now(),
  ended_at timestamp with time zone,
  duration_seconds integer
);

create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  role text,
  session_id text unique,
  started_at timestamp with time zone default now(),
  last_seen_at timestamp with time zone default now(),
  ended_at timestamp with time zone,
  user_agent text
);

create table if not exists public.activity_data_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  changed_fields jsonb default '[]',
  old_values jsonb default '{}',
  new_values jsonb default '{}',
  module text,
  created_at timestamp with time zone default now(),
  is_off_hours boolean default false
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists idx_activity_page_views_user_started on public.activity_page_views (user_id, started_at);
create index if not exists idx_activity_page_views_route on public.activity_page_views (route);
create index if not exists idx_activity_page_views_module on public.activity_page_views (module);
create index if not exists idx_activity_page_views_started_at on public.activity_page_views (started_at);

create index if not exists idx_activity_sessions_user_last_seen on public.activity_sessions (user_id, last_seen_at);
create index if not exists idx_activity_sessions_session_id on public.activity_sessions (session_id);

create index if not exists idx_activity_data_changes_user_created on public.activity_data_changes (user_id, created_at);
create index if not exists idx_activity_data_changes_table_record on public.activity_data_changes (table_name, record_id);
create index if not exists idx_activity_data_changes_created_at on public.activity_data_changes (created_at);
create index if not exists idx_activity_data_changes_action on public.activity_data_changes (action);

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.activity_page_views enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.activity_data_changes enable row level security;

-- activity_page_views policies
drop policy if exists "activity_page_views_insert_own" on public.activity_page_views;
create policy "activity_page_views_insert_own"
  on public.activity_page_views
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "activity_page_views_update_own" on public.activity_page_views;
create policy "activity_page_views_update_own"
  on public.activity_page_views
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "activity_page_views_select_admin" on public.activity_page_views;
create policy "activity_page_views_select_admin"
  on public.activity_page_views
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "activity_page_views_service_role_all" on public.activity_page_views;
create policy "activity_page_views_service_role_all"
  on public.activity_page_views
  for all
  to service_role
  using (true)
  with check (true);

-- activity_sessions policies
drop policy if exists "activity_sessions_insert_own" on public.activity_sessions;
create policy "activity_sessions_insert_own"
  on public.activity_sessions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "activity_sessions_update_own" on public.activity_sessions;
create policy "activity_sessions_update_own"
  on public.activity_sessions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "activity_sessions_select_admin" on public.activity_sessions;
create policy "activity_sessions_select_admin"
  on public.activity_sessions
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "activity_sessions_service_role_all" on public.activity_sessions;
create policy "activity_sessions_service_role_all"
  on public.activity_sessions
  for all
  to service_role
  using (true)
  with check (true);

-- activity_data_changes policies
drop policy if exists "activity_data_changes_insert_own" on public.activity_data_changes;
create policy "activity_data_changes_insert_own"
  on public.activity_data_changes
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "activity_data_changes_update_own" on public.activity_data_changes;
create policy "activity_data_changes_update_own"
  on public.activity_data_changes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "activity_data_changes_select_admin" on public.activity_data_changes;
create policy "activity_data_changes_select_admin"
  on public.activity_data_changes
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "activity_data_changes_service_role_all" on public.activity_data_changes;
create policy "activity_data_changes_service_role_all"
  on public.activity_data_changes
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 4. GRANTS
-- ============================================================

grant select, insert, update, delete on public.activity_page_views to authenticated;
grant select, insert, update, delete on public.activity_sessions to authenticated;
grant select, insert, update, delete on public.activity_data_changes to authenticated;

grant all on public.activity_page_views to service_role;
grant all on public.activity_sessions to service_role;
grant all on public.activity_data_changes to service_role;

-- ============================================================
-- 5. TRIGGER FUNCTION
-- ============================================================

create or replace function public.record_activity_data_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_user_name text;
  v_action text;
  v_record_id uuid;
  v_old_values jsonb;
  v_new_values jsonb;
  v_changed_fields jsonb;
  v_created_at timestamp with time zone := now();
  v_is_off_hours boolean;
  v_hour int;
  v_key text;
begin
  begin
    v_user_id := auth.uid();

    v_user_name := null;
    if v_user_id is not null then
      begin
        select coalesce(p.full_name, u.email)
          into v_user_name
        from auth.users u
        left join public.profiles p on p.id = u.id
        where u.id = v_user_id;
      exception when others then
        v_user_name := null;
      end;
    end if;

    if tg_op = 'INSERT' then
      v_action := 'insert';
      v_old_values := '{}'::jsonb;
      v_new_values := to_jsonb(new);
      v_record_id := (to_jsonb(new)->>'id')::uuid;
    elsif tg_op = 'UPDATE' then
      v_action := 'update';
      v_old_values := to_jsonb(old);
      v_new_values := to_jsonb(new);
      v_record_id := (to_jsonb(new)->>'id')::uuid;
    elsif tg_op = 'DELETE' then
      v_action := 'delete';
      v_old_values := to_jsonb(old);
      v_new_values := '{}'::jsonb;
      v_record_id := (to_jsonb(old)->>'id')::uuid;
    end if;

    v_changed_fields := '[]'::jsonb;
    if tg_op = 'UPDATE' then
      for v_key in select jsonb_object_keys(v_new_values)
      loop
        if v_old_values -> v_key is distinct from v_new_values -> v_key then
          v_changed_fields := v_changed_fields || to_jsonb(v_key);
        end if;
      end loop;
    end if;

    v_hour := extract(hour from v_created_at at time zone 'UTC');
    v_is_off_hours := (v_hour < 8 or v_hour >= 21);

    insert into public.activity_data_changes (
      user_id, user_name, table_name, record_id, action,
      changed_fields, old_values, new_values, module,
      created_at, is_off_hours
    ) values (
      v_user_id, v_user_name, tg_table_name, v_record_id, v_action,
      v_changed_fields, v_old_values, v_new_values, tg_table_name,
      v_created_at, v_is_off_hours
    );

  exception when others then
    raise warning 'record_activity_data_change failed for table % op %: %', tg_table_name, tg_op, sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$function$;

grant execute on function public.record_activity_data_change() to authenticated, service_role;

-- ============================================================
-- 6. TRIGGERS ON EXISTING TABLES
-- ============================================================

drop trigger if exists trg_activity_patients on public.patients;
create trigger trg_activity_patients
  after insert or update or delete on public.patients
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_appointments on public.appointments;
create trigger trg_activity_appointments
  after insert or update or delete on public.appointments
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_treatment_plans on public.treatment_plans;
create trigger trg_activity_treatment_plans
  after insert or update or delete on public.treatment_plans
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_treatment_plan_items on public.treatment_plan_items;
create trigger trg_activity_treatment_plan_items
  after insert or update or delete on public.treatment_plan_items
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_billings on public.billings;
create trigger trg_activity_billings
  after insert or update or delete on public.billings
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_billing_payments on public.billing_payments;
create trigger trg_activity_billing_payments
  after insert or update or delete on public.billing_payments
  for each row execute function public.record_activity_data_change();

drop trigger if exists trg_activity_expenses on public.expenses;
create trigger trg_activity_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.record_activity_data_change();

-- ============================================================
-- 7. CLEANUP CRON JOB
-- ============================================================

select cron.unschedule(jobid)
from cron.job
where jobname = 'cleanup_activity_logs_1year';

select cron.schedule(
  'cleanup_activity_logs_1year',
  '0 2 * * *',
  $cron$
  delete from public.activity_page_views where started_at < now() - interval '1 year';
  delete from public.activity_sessions where started_at < now() - interval '1 year';
  delete from public.activity_data_changes where created_at < now() - interval '1 year';
  $cron$
);