# Safe Pharmacy Medicine → Inventory Mapping Workflow (plan only)

A review-and-confirm screen where an administrator explicitly maps each unmatched billed medicine name to an existing inventory item. Nothing maps itself; nothing historical is corrected here.

## 1. Proposed UI / workflow

New screen: **Pharmacy → "Inventory Mapping"** button opening a full-width dialog titled *Medicine → Inventory Mapping*.

Layout:

```text
[ Unmatched medicine names: 14 | Unmatched lines: 321 | Unmatched units: 1,570 ]

Billed Name        Occur  Units  Medicine Record   Current Link  Candidates      Status
MOX - CV             86    467   — (none)          NULL          3 possible ⚠    Unmapped   [Review]
Metrogyl ER          65    353   — (none)          NULL          none            Unmapped   [Review]
Keterol DT           63    224   Keterol DT        NULL          1 possible      Unmapped   [Review]
...
```

Clicking **Review** opens a per-name panel:

- Billed name exactly as typed (whitespace/case shown literally), occurrences, total units.
- Existing `medicines` record (if a normalized match exists) and its current `inventory_item_id`.
- Candidate inventory items, each as a card: item name, current stock qty, unit cost, unit, category, active/inactive flag, and any strength/formulation token parsed out of the name (mg / ml / syrup / DT / ER) purely for display.
- Confidence + reason text carried over from the audit (MEDIUM / LOW / NO MATCH).
- Administrator picks exactly one outcome:
  1. **Map to this inventory item** (radio choice, nothing preselected) — then a confirm step that restates "Billed name → Item name (strength, stock, cost)" and requires a second click.
  2. **No matching inventory item** — records the decision without touching data.
  3. **Needs manual review** — parks the row.

Row status badges: Unmapped / Mapped / No inventory item / Needs review.

Candidate discovery (display only, never auto-select): normalized token overlap against `inventory_items.name` plus items already referenced by a similarly named `medicines` row. Candidate lists are ordered but no radio is preselected, and MOX - CV, Moxiclav Syrup, METRO 400 mg, Keterol DT, Wysolone and MCDOL P are hard-flagged as confirmation-required regardless of score.

## 2. Existing files touched (minimum)

- `src/pages/Pharmacy.tsx` — add one toolbar button that opens the mapping dialog. No change to sales/dispense logic.
- `src/components/pharmacy/MedicineInventoryMapping.tsx` — **new** component holding the whole workflow (list, review panel, confirm step).
- `src/components/settings/ClinicSettingsTabs.tsx` — no change required; its Medicines tab already exposes the inventory link select and stays the single-record editor.

Nothing else. No changes to `src/pages/Inventory.tsx`, billing, or `ClinicWorkflow`.

## 3. Database tables / functions involved

- Read: `billing_items` (`treatment_type = 'Medicine'`), `billings` (`payment_status`), `medicines`, `inventory_items`.
- Write, only after explicit confirmation: `medicines.inventory_item_id` (and, where no medicine record exists for a billed name, one new `medicines` row carrying that exact name plus the confirmed link).
- Untouched: `deduct_inventory_for_bill`, `restock_inventory_for_bill`, `handle_billing_insert_inventory`, `handle_billing_status_inventory`, `inventory_transactions`, `inventory_items.quantity`.
- No migration and no schema change are needed for the mapping itself.

## 4. Exact data updated after confirmation

Per confirmed mapping, one of:

- `UPDATE medicines SET inventory_item_id = <confirmed item> WHERE id = <existing medicine id>`, or
- `INSERT INTO medicines (name, inventory_item_id, …defaults from the existing form)` when the billed name has no medicine record — name stored verbatim so the deduction function's normalized lookup hits it.

Never written: inventory item names, medicine names, `inventory_items.quantity`, `status`, cost, or any `inventory_transactions` row.

"No matching inventory item" and "Needs manual review" write nothing at all in this phase; they are held in component state and shown in the summary so the administrator can act later.

## 5. Preventing duplicate / ambiguous mappings

- No candidate is ever preselected; saving is impossible until a radio is chosen and the confirm step is clicked.
- When more than one candidate exists, an amber warning lists the conflicting strengths/formulations (e.g. MOX - CV → 625 mg tablet vs 457 mg syrup vs Mox Clav Syrup) and the confirm button is labelled "I confirm this is the same item".
- Inactive candidates (`METRO-400 mg`, `MOX CV 457 mg SYRUP`) are shown with an "Inactive — will not deduct" warning, since the fallback lookup only considers active items.
- If a chosen inventory item is already linked to a different medicine, the panel warns that two medicines will share one item and asks for confirmation.
- Zero-stock / zero-cost candidates (`MCDOL -SP`, `Ketorolac -T-Lac`, `Amox Clav (MCIYON - CV`) are flagged as likely stale records.

## 6. Historical unmatched sales stay untouched

This workflow issues no `inventory_transactions` rows and no quantity changes, so the 321 historical lines / 1,570 units remain undeducted and Stock Value is unchanged. The screen states this explicitly: "Mapping affects future bills only." Because `deduct_inventory_for_bill` guards per bill, previously processed bills will not re-run — a separate, separately approved backfill step will decide whether those units are adjusted.

## 7. Validation plan

- Before/after read-only queries: unmatched line count should fall for future bills only; `inventory_items.quantity` and `inventory_transactions` counts must be identical immediately after mapping.
- Confirm each mapped billed name now resolves through the same normalized lookup the function uses (`lower(trim(split_part(description,' (',1)))`).
- End-to-end on one new test pharmacy bill for a newly mapped medicine: bill marked paid → `stock_out` row created → quantity reduced → Stock Value reduced.
- Re-run the audit query to confirm the remaining unmatched names are exactly the ones deliberately left as "no inventory item" (the Metrogyl ER family) or "needs review".

## 8. Estimated minimal scope

One new component (~350 lines) plus a single button in `Pharmacy.tsx`. No migration, no edge function, no schema change, no changes to inventory or billing logic.
