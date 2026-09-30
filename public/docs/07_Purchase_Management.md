# 07 — Purchase Management

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Tables
- `purchases` — vendor invoice header
- `purchase_items` — line items linked to `inventory_items`
- `suppliers` / `supplier_items` — vendor master

## Lifecycle
```
Draft → Ordered → Received → Paid
                     │         │
                     ▼         ▼
            inventory_items   expenses (auto)
            qty ↑            mirrored row
```

## Triggers
| Trigger | Effect |
|---|---|
| `set_purchase_delivery_date` | stamps `delivery_date` on receive |
| `handle_purchase_inventory_update` | adjusts inventory, logs transactions |
| `sync_purchase_to_expense` | inserts `expenses` row when `status='paid'` |

## Double-counting risk
If a user adds a manual `expenses` row for the same vendor invoice that later gets auto-mirrored when the purchase is marked paid, the expense appears twice. **Recommendation:** add UNIQUE constraint `(source='purchase', source_id)` on expenses.

## UI surfaces
- `Purchases.tsx` — list, create, status transitions
- `PurchaseItemPicker.tsx` — line-item picker
- `Suppliers.tsx` — vendor master
