# Pharmacy Medicine → Inventory Mapping Audit (READ-ONLY)

Nothing was changed. This is a report plus a proposed mapping for a later, separately approved correction step.

## How matching works today

Stock deduction runs inside the database function `deduct_inventory_for_bill`. For each paid bill line with `treatment_type = 'Medicine'` it:

1. takes the description up to the first `" ("`, trims and lowercases it,
2. looks for a `medicines` row with that exact normalized name and uses its `inventory_item_id`,
3. otherwise looks for an active `inventory_items` row with that exact normalized name,
4. if neither is found the line is skipped silently (no stock out, no quantity deduction).

So a line fails only when the typed medicine name does not exactly equal a medicine name or an inventory item name.

## A. Summary (paid bills, `treatment_type = 'Medicine'`)

| Metric | Line items | Units |
|---|---|---|
| Total medicine line items | 1,241 | 5,318 |
| Matched (deducted) | 920 | — |
| Unmatched (never deducted) | 321 | 1,570 |
| High confidence candidates | 0 | 0 |
| Medium confidence candidates | 130 | 539 |
| Low confidence candidates | 93 | 490 |
| No existing inventory item | 98 | 541 |

Of the 321 unmatched lines: 74 correspond to a `medicines` record that exists but has `inventory_item_id = NULL`; 247 have no `medicines` record at all under the typed name.

Master-data context: 32 medicines total (30 linked, 2 with NULL link), 324 inventory items, 294 inventory items never referenced by any medicine, 6 inventory items sharing a duplicated normalized name, 0 duplicate medicine names.

## B. Mapping proposal

| Medicine name (as billed) | Occurrences | Total units | Current inventory_item_id | Proposed inventory item | Confidence | Reason | Action |
|---|---|---|---|---|---|---|---|
| MOX - CV | 86 | 467 | NULL (no medicine record) | `Icpa Mox Cv-625mg` (?) | LOW | No strength on the bill; existing item is 625 mg only. Also a 457 mg syrup exists | Manual review |
| Metrogyl ER | 65 | 353 | NULL | none | NO MATCH | Only `Metrogyl 400` (plain, not ER) exists | Manual inventory setup |
| Keterol DT | 63 | 224 | NULL (medicine `Keterol DT` exists, link NULL) | `Ketorol-dt` | MEDIUM | Spelling variant of the same DT tablet; competing item `Ketorolac-t Lac` is a different brand/form | Manual confirmation |
| MOX CV-625mg | 35 | 193 | NULL | `Icpa Mox Cv-625mg` | MEDIUM | Same strength 625 mg; brand prefix `Icpa` only difference (medicine `ICPA MOX - CV` already points here) | Manual confirmation |
| METROGYL ER-600 | 21 | 126 | NULL | none | NO MATCH | ER 600 strength does not exist in inventory | Manual inventory setup |
| Metrogyl ER 600 | 12 | 62 | NULL | none | NO MATCH | Same as above, spacing variant | Manual inventory setup |
| MOX - CV 625 mg | 12 | 57 | NULL | `Icpa Mox Cv-625mg` | MEDIUM | Strength matches exactly | Manual confirmation |
| METRO 400 mg | 7 | 37 | NULL | `METRO-400 mg` (inactive) or `Metrogyl 400` | MEDIUM | Exact-strength item exists but `is_active = false`; active alternative is a different brand | Manual confirmation |
| Wysolone (trailing space) | 11 | 26 | NULL (medicine `Wysolone ` exists, link NULL) | `Wysolone Tab` | MEDIUM | Same molecule/brand; billed name carries no strength | Manual confirmation |
| Amox Icpa Mox -625 mg | 3 | 13 | NULL | `Icpa Mox Cv-625mg` (?) | LOW | Free-text label; unclear whether plain amox or amox-clav | Manual review |
| MCDOL P | 1 | 6 | NULL | `MCDOL -SP` (?) | LOW | P vs SP are different formulations; item also has qty 0 / cost 0 | Manual review |
| Moxiclav Syrup | 2 | 2 | NULL | `Mox Clav Syrup` or `MOX CV 457 mg SYRUP` (inactive) | LOW | Two candidate syrups, different concentrations | Manual review |
| Pediflor paste | 2 | 2 | NULL (medicine `Pediflorpaste` linked) | `Pediflor Kids Tooth Paste` | MEDIUM | Medicine record already maps to this item; only the spacing of the billed name differs | Manual confirmation |
| Wysolone - 10mg | 1 | 2 | NULL | `Wysolone Tab` | LOW | Existing item carries no strength, so 10 mg equivalence is unproven | Manual review |

## C. Duplicate / conflict report

- Multiple possible matches: `MOX - CV` and `Moxiclav Syrup` (625 mg tablet vs 457 mg syrup vs `Mox Clav Syrup`), `Keterol DT` (`Ketorol-dt` vs `Ketorolac-t Lac` / `Ketorolac -T-Lac`), `METRO 400 mg` (`METRO-400 mg` inactive vs `Metrogyl 400`).
- Strength/formulation conflicts: Metrogyl ER 600 vs Metrogyl 400; MOX CV 625 mg tablet vs MOX CV 457 mg syrup; MCDOL P vs MCDOL -SP; Wysolone (no strength) vs Wysolone 10 mg.
- Duplicate inventory names (same normalized name, multiple rows): `3M ESPE relyx lutting 2` x3, `20 4%` x2, `25 4%` x2. None of these are pharmacy items, so they do not affect this mapping.
- Near-duplicate inventory pairs: `Ketorolac -T-Lac` (qty 0, cost 8) and `Ketorolac-t Lac` (qty 195, cost 10); `Amox Clav (MCIYON - CV` (unterminated name, qty 0) alongside `Icpa Mox Cv-625mg`.
- Medicines with NULL `inventory_item_id`: `Keterol DT`, `Wysolone ` (2 of 32).
- Inventory items never referenced by a medicine: 294 of 324 (mostly consumables, expected).

## D. Top unmatched medicines by units sold

MOX - CV (467) · Metrogyl ER (353) · Keterol DT (224) · MOX CV-625mg (193) · METROGYL ER-600 (126) · Metrogyl ER 600 (62) · MOX - CV 625 mg (57) · METRO 400 mg (37) · Wysolone (26) · Amox Icpa Mox -625 mg (13) · MCDOL P (6) · Moxiclav Syrup (2) · Pediflor paste (2) · Wysolone - 10mg (2).

That is the complete unmatched set — only 14 distinct normalized names account for all 321 lines, so a list of 20 is not available.

## E. Validation of the stock impact

Confirmed: unmatched lines are skipped by the `CONTINUE` branch of `deduct_inventory_for_bill`, so for those 321 lines (1,570 units) there is **no** `inventory_transactions` `stock_out` row, **no** `quantity` decrement, and therefore **no** reduction in Inventory Stock Value. Bills that contained a mix of matched and unmatched lines did deduct the matched lines only — the per-bill idempotency guard means those bills are already marked as processed, so a later fix will need an explicit backfill rather than a simple re-run.

## F. Safe correction recommendation

1. **SAFE TO MAP (auto-safe)** — none. No unmatched name resolves with high confidence.
2. **REQUIRES MANUAL CONFIRMATION** — Keterol DT, MOX CV-625mg, MOX - CV 625 mg, METRO 400 mg, Wysolone, Pediflor paste (130 lines / 539 units).
3. **REQUIRES MANUAL REVIEW (ambiguous)** — MOX - CV, Amox Icpa Mox -625 mg, MCDOL P, Moxiclav Syrup, Wysolone - 10mg (93 lines / 490 units).
4. **NO EXISTING INVENTORY ITEM** — Metrogyl ER, METROGYL ER-600, Metrogyl ER 600 (98 lines / 541 units) need an ER 600 item created deliberately, not auto-created.

Suggested future correction shape (not executed): confirm each pairing above, set `medicines.inventory_item_id` on the confirmed medicine records, add the missing medicine records for names typed only in billing, and then decide separately whether historical unmatched units should be backfilled as stock-out adjustments or left as-is.

## Final safety check

No code changed. No database or data changed. No inventory item created. No medicine renamed. No mapping applied. Read-only audit only.
