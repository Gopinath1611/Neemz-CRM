# Lab Orders — Money Column Clarity (Paid to Lab vs Collected from Patient)

## What we will do

1. **Rename header only**: `Lab Payment` → `Paid to Lab`. Badges (Paid/Unpaid), toggle logic, and data stay exactly as they are.
2. **New column `Collected from Patient`** placed immediately after `Paid to Lab`, before `Rate`. `Rate` column untouched.
3. Because no field today links a lab order to the patient's billing, we add one small link and read the real collection from it (decision confirmed with user).

## Data source for "Collected from Patient" (new)

- Schema: add one nullable column `billing_id uuid references public.billings(id) on delete set null` to `public.lab_orders`. No grants/policies change (column inherits table's existing access).
- Lab order form (New/Edit Lab Order dialog): add an optional **Linked Invoice** picker. When a patient is selected, list that patient's invoices (invoice number, date, total, paid). Staff pick the invoice that charged the patient for this lab work. Optional — order can be saved without it.
- List view: for orders with a linked invoice, the new column shows the collected amount on that invoice (`amount_paid`, falling back to sum of `billing_payments` if needed), formatted as ₹. Unlinked orders show `—`. One extra batched query for the linked billing ids of the visible orders only.

## What stays unchanged

- No changes to filters, search, pagination, KPI cards (Total Lab Cost etc.), status logic, warranty handling, or any calculation.
- No backfill of existing orders — they show `—` until someone links an invoice.
- No changes to billing, payments, or finance modules.

## Files touched

- New migration: `lab_orders` + nullable `billing_id` FK column.
- `src/pages/LabOrders.tsx` — header rename, new column + cell, batched billing fetch, Linked Invoice picker in the order dialog.
- Supabase types regeneration after migration.

## Verification

- `npx tsgo --noEmit -p tsconfig.app.json` passes.
- Browser check on `/lab-orders`: header shows "Paid to Lab", new column sits before Rate, unlinked orders show `—`, linking an invoice to an order shows its collected amount, Paid/Unpaid toggle still works.
