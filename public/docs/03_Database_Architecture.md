# 03 — Database Architecture

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Schema scope
~145 tables in `public`. All RLS-enabled. Below: money + clinical core. See `src/integrations/supabase/types.ts` for full column lists.

## Money tables
| Table | Purpose | Key date | Branch_id? |
|---|---|---|---|
| `billings` | Invoice headers | `created_at` | ❌ |
| `billing_items` | Line items | `created_at` | ❌ |
| `billing_payments` | Cash receipts | `payment_date` | ❌ |
| `expenses` | All outflows (manual + auto from purchases) | `expense_date` | ❌ |
| `expense_categories`/`_subcategories` | Master | — | — |
| `purchases` | Vendor invoices | `purchase_date` | ❌ |
| `purchase_items` | Line items | — | ❌ |
| `inventory_items` | Stock snapshot | — | ✅ |
| `inventory_transactions` | Stock movements | `transaction_date` | ❌ |
| `deposits`/`deposit_invoices` | Patient advances | `created_at` | ❌ |
| `orthodontic_payments` | Ortho cash receipts | `payment_date` | ❌ |
| `emi_insurance_cases` | Financing | `created_at` | ❌ |
| `referrals` | Referral revenue tracking | — | ❌ |

## Triggers (money-touching)
| Trigger | On | Effect |
|---|---|---|
| `set_billing_payment_dedupe_key` | `billing_payments BEFORE INSERT` | Generates dedupe key |
| `sync_purchase_to_expense` | `purchases AFTER UPDATE OF status` | Inserts mirrored `expenses` row when paid |
| `handle_purchase_inventory_update` | `purchases AFTER INSERT/UPDATE` | Adjusts `inventory_items.quantity`, logs `inventory_transactions` |
| `set_purchase_delivery_date` | `purchases BEFORE UPDATE` | Stamps delivery date |
| `update_inventory_status` | `inventory_items` | Recomputes low-stock flag |
| `sync_referral_from_billing` | `billings AFTER INSERT/UPDATE` | Mirrors revenue into `referrals` |
| `generate_expense_number` | `expenses BEFORE INSERT` | EXP-YYYY-NNNN |

## RPCs / Functions
- `has_role(uuid, app_role)` — role gate
- `recompute_fy_actuals(fy text, branch_id uuid)` — refreshes `fy_actual_tracking` from `billings`+`expenses`
- `build_billing_payment_dedupe_key(...)` — helper

## ER (high level)
See `docs/diagrams/database-er.mmd`.

## Schema versioning
Migrations managed by Lovable Cloud. No external version table. Schema diffs come from the platform.
