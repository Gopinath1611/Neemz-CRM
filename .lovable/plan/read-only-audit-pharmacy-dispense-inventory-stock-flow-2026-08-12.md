# Read-Only Audit — Pharmacy Dispense → Inventory Stock Flow

## Verdicts

| Check | Result |
|---|---|
| Stock deduction on pharmacy sale | YES (partial — see gap) |
| Stock Out movement created | YES (same partial coverage) |
| Reduced qty reflected in Inventory current stock | YES |
| Stock Value recalculated from reduced current qty | YES |
| Stock Value decreases after pharmacy sale | YES (only when the item resolves) |
| Works for single-item and multi-item sales | YES (loops all Medicine line items) |
| Cost-based valuation (not selling price) | YES |

## Exact data flow found

```text
Clinic Workflow → PaymentStep / BillingDetailDialog
  → billings (payment_status = 'paid') + billing_items (treatment_type = 'Medicine')
      ↓ DB trigger trg_handle_billing_insert_inventory (INSERT)
      ↓ DB trigger trg_handle_billing_status_inventory (UPDATE, unpaid → paid)
  → deduct_inventory_for_bill(billing_id)   [SECURITY DEFINER, idempotent]
      • resolves item: medicines.inventory_item_id by name, else inventory_items.name
      • inventory_items.quantity = GREATEST(0, qty - line qty), status recomputed
      • inserts inventory_transactions (type = 'stock_out', marker [auto:bill-deduct:<id>])
  → Inventory.tsx reads inventory_items.quantity (+ realtime sync)
      • unitCost(item) = cost_price → latest purchase cost → 0
      • stockValueOf = unitCost × current quantity  (cost, never pharmacy sale price)
```

Reversal path exists too: `restock_inventory_for_bill` runs when status flips to cancelled/void/refunded (`stock_in`, marker `[auto:bill-restock:<id>]`).

There is **no separate pharmacy "dispense" write path** — `src/pages/Pharmacy.tsx` is read/report only (prescription groups, medicine-wise sales). It contains no `inventory_transactions` or quantity writes. Deduction happens exclusively through the paid-billing trigger.

## Gap / bug found (data-level, not code)

`deduct_inventory_for_bill` resolves the inventory item by matching `split_part(description, ' (', 1)` against `medicines.name` (needing a non-null `inventory_item_id`) or `inventory_items.name`. When neither matches it silently `CONTINUE`s — no deduction, no `stock_out`, no error.

Measured on current data:
- 1,241 Medicine line items on paid bills; **321 (≈26%) resolve to nothing** → never deducted.
- Top unresolved names: `MOX - CV` (82 lines / 444 units), `Metrogyl ER` (65 / 353), `Keterol DT` (63 / 224), `MOX CV-625mg` (35 / 193), `METROGYL ER-600` (21 / 126), plus trailing-space and case variants (`MOX - CV `, `Wysolone `, `Moxiclav Syrup `).
- 2 of 32 rows in `medicines` have `inventory_item_id = NULL`.
- Example bills where med items > stock_out rows: `ef887aba…` (2 items / 1 movement), `7e9ac9bc…` (5 / 4), `cd630db5…` (5 / 4).

Consequences: those units stay in `inventory_items.quantity`, so Stock Value is **overstated** for the affected medicines, and pharmacy COGS is never booked. Secondary notes: matching is exact-name only (no alias/brand mapping), `medicines` may map many spellings to one stock row, and `GREATEST(0, …)` masks over-dispense instead of flagging it.

## Files / objects involved

- `src/components/workflow/PaymentStep.tsx` — creates billings/billing_items; explicitly defers deduction to the trigger.
- `src/components/workflow/BillingDetailDialog.tsx` — payment status updates that fire the trigger.
- `src/pages/Pharmacy.tsx` — read-only reporting; no stock writes.
- `src/pages/Inventory.tsx` — `unitCost`, `stockValueOf`, filter-aware Stock Value, realtime sync.
- `src/components/inventory/InventoryItemForm.tsx` — manual adjustments only.
- DB: `deduct_inventory_for_bill`, `restock_inventory_for_bill`, `handle_billing_insert_inventory`, `handle_billing_status_inventory`, `update_inventory_status`; tables `billings`, `billing_items`, `medicines`, `inventory_items`, `inventory_transactions`.

No code, data, or schema was changed.
