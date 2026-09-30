create table public.lab_order_backfill_dismissals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  billing_id uuid not null references public.billings(id) on delete cascade,
  dismissed_by uuid references auth.users(id),
  dismissed_at timestamptz not null default now(),
  unique (patient_id, billing_id)
);
grant select, insert, delete on public.lab_order_backfill_dismissals to authenticated;
grant all on public.lab_order_backfill_dismissals to service_role;
alter table public.lab_order_backfill_dismissals enable row level security;
create policy "Authenticated can read dismissals" on public.lab_order_backfill_dismissals for select to authenticated using (true);
create policy "Authenticated can insert dismissals" on public.lab_order_backfill_dismissals for insert to authenticated with check (true);
create policy "Authenticated can delete dismissals" on public.lab_order_backfill_dismissals for delete to authenticated using (true);