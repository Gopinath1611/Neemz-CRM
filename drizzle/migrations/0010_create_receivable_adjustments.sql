create table public.receivable_adjustments (
  id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.billings(id) on delete cascade,
  patient_id uuid,
  adjustment_type text not null,
  amount numeric not null,
  reason text not null,
  pending_before numeric not null,
  pending_after numeric not null,
  reverses_id uuid references public.receivable_adjustments(id),
  adjusted_by uuid references auth.users(id),
  adjusted_at timestamptz not null default now(),
  constraint receivable_adjustments_amount_nonzero check (amount <> 0)
);

create index receivable_adjustments_billing_id_idx on public.receivable_adjustments (billing_id);

create unique index receivable_adjustments_reverses_id_key
  on public.receivable_adjustments (reverses_id)
  where reverses_id is not null;

grant select, insert on public.receivable_adjustments to authenticated;
grant all on public.receivable_adjustments to service_role;

alter table public.receivable_adjustments enable row level security;

create policy "Authenticated can read adjustments"
  on public.receivable_adjustments for select to authenticated using (true);

create policy "Admins can insert adjustments"
  on public.receivable_adjustments for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and adjusted_by = auth.uid());

create or replace function public.validate_receivable_reversal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_orig record;
begin
  if NEW.reverses_id is null then
    if NEW.amount < 0 then
      raise exception 'Negative adjustments must reference the entry they reverse';
    end if;
    return NEW;
  end if;

  select id, billing_id, amount, adjustment_type
    into v_orig
    from public.receivable_adjustments
   where id = NEW.reverses_id;

  if v_orig.id is null then
    raise exception 'Reversal references a missing adjustment';
  end if;

  if v_orig.reverses_id is not null then
    raise exception 'Cannot reverse a reversal row';
  end if;

  if NEW.billing_id <> v_orig.billing_id then
    raise exception 'Reversal must belong to the same invoice as the original adjustment';
  end if;

  if NEW.amount <> -v_orig.amount then
    raise exception 'Reversal amount must equal the negative of the original amount (%, got %)', -v_orig.amount, NEW.amount;
  end if;

  return NEW;
end;
$$;

create trigger validate_receivable_reversal_trg
  before insert on public.receivable_adjustments
  for each row execute function public.validate_receivable_reversal();