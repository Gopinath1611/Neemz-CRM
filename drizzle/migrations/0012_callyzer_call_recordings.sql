create table if not exists public.callyzer_call_recordings (
  id uuid primary key default gen_random_uuid(),
  call_log_id uuid not null unique references public.call_logs(id) on delete cascade,
  recording_url text not null,
  environment text,
  created_at timestamptz not null default now()
);

grant select on public.callyzer_call_recordings to authenticated;
grant all on public.callyzer_call_recordings to service_role;

alter table public.callyzer_call_recordings enable row level security;

drop policy if exists "callyzer_recordings admin read" on public.callyzer_call_recordings;
create policy "callyzer_recordings admin read" on public.callyzer_call_recordings
  for select to authenticated using (public.has_role(auth.uid(),'admin'));

create index if not exists callyzer_call_recordings_call_log_id_idx
  on public.callyzer_call_recordings (call_log_id);
