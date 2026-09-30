# 06 — Inventory Architecture

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Tables
- `inventory_items` — stock snapshot (qty, cost_price, sale_price, branch_id, status)
- `inventory_categories` — master
- `inventory_transactions` — every stock movement (`stock_in`, `stock_out`, `adjustment`)

## Writers
| Source | When | Effect |
|---|---|---|
| `Purchases.tsx` (paid) | trigger `handle_purchase_inventory_update` | qty ↑, txn `stock_in` |
| `PaymentStep.tsx` (treatment consumption) | inline insert | qty ↓, txn `stock_out` |
| `InventoryItemForm.tsx` adjustment | manual | qty ±, txn `adjustment` |

## Readers
- `Inventory.tsx` — list, value KPI (`qty * cost_price`)
- `InventoryStatsCards.tsx` — totals
- `Pharmacy.tsx` — medicine subset
- `Finance.tsx` — does NOT read inventory value as an asset

## Branch scope
`inventory_items.branch_id` exists and is filtered correctly via `BranchContext`. **Only money-adjacent table with working branch scope.**

## Status
`update_inventory_status` trigger recomputes `low_stock` / `out_of_stock` flags on every write.

## Gaps / Recommendations
- Inventory value is not booked as an asset in any P&L view.
- No FIFO/weighted-average costing — `cost_price` is the latest purchase cost.
- No batch/expiry tracking on `inventory_items` (only on `medicines`).
