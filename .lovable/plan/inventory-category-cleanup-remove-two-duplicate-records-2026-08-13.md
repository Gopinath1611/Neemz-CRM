# Inventory Category Cleanup — Remove Two Duplicate Records

## Verified current state

The category master (`inventory_categories`) contains 22 records, including three near-duplicates:

| Category | Items referencing it | Total qty |
|---|---|---|
| `Head Cap` (keep) | 1 | 4 |
| `head cap` (remove) | 0 | 0 |
| `Hesd cap` (remove) | 0 | 0 |

Confirmed by query: neither `head cap` nor `Hesd cap` is referenced by any inventory item. The single real item ("Head Cap", HC-0001, 4 pack, ₹100) already points at the correct `Head Cap` record, so no item reassignment is needed.

## Change

Delete exactly two rows from the category master:
- `head cap`
- `Hesd cap`

Nothing else: no renames, no new category, no item edits, no quantity changes, no stock transactions, no schema change, no migration, no code files touched.

## Technical detail

One data-only statement through the existing category master table:

```sql
DELETE FROM public.inventory_categories
WHERE id IN (
  '3365a0e5-e9cc-4054-a39a-31378731b65e', -- head cap
  '24d4021d-8945-4d72-9d20-6afd9e4b02db'  -- Hesd cap
);
```

Targeting by id (not name) avoids any case-insensitive match risk against `Head Cap`.

## Validation after the change

1. `Head Cap` exists exactly once; `head cap` and `Hesd cap` are gone.
2. Remaining 20 categories unchanged (name-by-name comparison against the pre-change list).
3. Item HC-0001 still has category `Head Cap`, qty 4, price ₹100, Low Stock status.
4. `inventory_transactions` row count unchanged.

If any unexpected reference to either id surfaces, the deletion is aborted and reported instead.
