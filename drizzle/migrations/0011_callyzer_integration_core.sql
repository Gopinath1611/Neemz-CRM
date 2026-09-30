-- 1) call_logs: Callyzer columns (raw values preserved)
alter table public.call_logs
  add column if not exists callyzer_log_id text,
  add column if not exists raw_call_type text,
  add column if not exists callyzer_environment text;

create unique index if not exists call_logs_callyzer_log_id_key
  on public.call_logs (callyzer_log_id) where callyzer_log_id is not null;
create index if not exists call_logs_callyzer_environment_idx
  on public.call_logs (callyzer_environment) where callyzer_environment is not null;

-- 2) Settings (single row, admin managed)
create table if not exists public.callyzer_settings (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  sandbox_base_url text,
  production_base_url text,
  webhook_secret text,
  is_enabled boolean not null default false,
  last_verified_at timestamptz,
  last_verify_error text,
  last_webhook_at timestamptz,
  last_backfill_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.callyzer_settings to authenticated;
grant all on public.callyzer_settings to service_role;
alter table public.callyzer_settings enable row level security;

drop policy if exists "callyzer_settings admin read" on public.callyzer_settings;
create policy "callyzer_settings admin read" on public.callyzer_settings
  for select to authenticated using (public.has_role(auth.uid(),'admin'));
drop policy if exists "callyzer_settings admin insert" on public.callyzer_settings;
create policy "callyzer_settings admin insert" on public.callyzer_settings
  for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "callyzer_settings admin update" on public.callyzer_settings;
create policy "callyzer_settings admin update" on public.callyzer_settings
  for update to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- 3) Employee mapping: Callyzer employee -> CRM user (call_logs.telecaller_id = profiles.id)
create table if not exists public.callyzer_employee_mappings (
  id uuid primary key default gen_random_uuid(),
  callyzer_emp_number text not null,
  callyzer_emp_name text,
  profile_id uuid references public.profiles(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (callyzer_emp_number)
);

grant select, insert, update, delete on public.callyzer_employee_mappings to authenticated;
grant all on public.callyzer_employee_mappings to service_role;
alter table public.callyzer_employee_mappings enable row level security;

drop policy if exists "callyzer_mappings admin all" on public.callyzer_employee_mappings;
create policy "callyzer_mappings admin all" on public.callyzer_employee_mappings
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- 4) Webhook logs (raw payload + partial/unknown flags)
create table if not exists public.callyzer_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  environment text,
  status text not null default 'ok' check (status in ('ok','partial','error')),
  message text,
  logs_received integer not null default 0,
  logs_inserted integer not null default 0,
  logs_updated integer not null default 0,
  logs_skipped integer not null default 0,
  unknown_call_types text[],
  payload jsonb
);

grant select on public.callyzer_webhook_logs to authenticated;
grant all on public.callyzer_webhook_logs to service_role;
alter table public.callyzer_webhook_logs enable row level security;

drop policy if exists "callyzer_webhook_logs admin read" on public.callyzer_webhook_logs;
create policy "callyzer_webhook_logs admin read" on public.callyzer_webhook_logs
  for select to authenticated using (public.has_role(auth.uid(),'admin'));

create index if not exists callyzer_webhook_logs_received_at_idx
  on public.callyzer_webhook_logs (received_at desc);

-- 5) Unmatched calls (Callyzer numbers with no lead/patient match)
create table if not exists public.callyzer_unmatched_calls (
  id uuid primary key default gen_random_uuid(),
  call_log_id uuid references public.call_logs(id) on delete cascade,
  phone text,
  normalized_phone text,
  callyzer_emp_number text,
  environment text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.callyzer_unmatched_calls to authenticated;
grant all on public.callyzer_unmatched_calls to service_role;
alter table public.callyzer_unmatched_calls enable row level security;

drop policy if exists "callyzer_unmatched admin all" on public.callyzer_unmatched_calls;
create policy "callyzer_unmatched admin all" on public.callyzer_unmatched_calls
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- 6) 30-day purge of webhook logs, service_role only
create or replace function public.purge_old_callyzer_webhook_logs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.callyzer_webhook_logs where received_at < now() - interval '30 days';
$$;

revoke all on function public.purge_old_callyzer_webhook_logs() from public;
revoke all on function public.purge_old_callyzer_webhook_logs() from anon;
revoke all on function public.purge_old_callyzer_webhook_logs() from authenticated;
grant execute on function public.purge_old_callyzer_webhook_logs() to service_role;

select cron.schedule(
  'purge-callyzer-webhook-logs-daily',
  '30 2 * * *',
  $$select public.purge_old_callyzer_webhook_logs();$$
);
