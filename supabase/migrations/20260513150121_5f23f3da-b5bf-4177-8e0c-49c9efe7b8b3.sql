with ranked_billings as (
  select
    id,
    invoice_number,
    row_number() over (
      partition by invoice_number
      order by
        case when coalesce(total_amount, 0) > 0 or coalesce(amount_paid, 0) > 0 then 0 else 1 end,
        coalesce(amount_paid, 0) desc,
        coalesce(total_amount, 0) desc,
        created_at desc,
        id desc
    ) as rn,
    first_value(id) over (
      partition by invoice_number
      order by
        case when coalesce(total_amount, 0) > 0 or coalesce(amount_paid, 0) > 0 then 0 else 1 end,
        coalesce(amount_paid, 0) desc,
        coalesce(total_amount, 0) desc,
        created_at desc,
        id desc
    ) as keeper_id
  from public.billings
  where invoice_number is not null
), duplicate_billings as (
  select id, keeper_id
  from ranked_billings
  where rn > 1
), moved_items as (
  update public.billing_items bi
  set billing_id = d.keeper_id
  from duplicate_billings d
  where bi.billing_id = d.id
    and not exists (
      select 1
      from public.billing_items existing
      where existing.billing_id = d.keeper_id
        and coalesce(existing.treatment_type, '') = coalesce(bi.treatment_type, '')
        and coalesce(existing.description, '') = coalesce(bi.description, '')
        and coalesce(existing.tooth_number, '') = coalesce(bi.tooth_number, '')
        and coalesce(existing.quantity, 0) = coalesce(bi.quantity, 0)
        and coalesce(existing.unit_price, 0) = coalesce(bi.unit_price, 0)
        and coalesce(existing.total_price, 0) = coalesce(bi.total_price, 0)
    )
  returning bi.id
), removed_duplicate_items as (
  delete from public.billing_items bi
  using duplicate_billings d
  where bi.billing_id = d.id
  returning bi.id
)
delete from public.billings b
using duplicate_billings d
where b.id = d.id;

create unique index if not exists billings_invoice_number_unique_idx
  on public.billings (invoice_number)
  where invoice_number is not null;