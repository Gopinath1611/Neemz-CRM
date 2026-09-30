# Stock should increase only after delivery is received

Today, the moment a purchase is saved, inventory quantity goes up — even if the delivery status is Pending. This changes it so stock moves only when a purchase is marked **Delivered**.

## New behaviour

1. Purchase saved with delivery status Pending or In Transit → no stock change, no stock-in entry. Inventory item records are still created for new item names (with quantity 0) so the item exists in the catalogue.
2. Purchase changed to **Delivered** → each item's quantity is added to inventory, cost price and supplier are refreshed, and a "stock_in" entry is recorded (once only).
3. Purchase moved back from Delivered to Pending/In Transit → the added quantity is reversed and a matching reversal entry is recorded, so nothing is double counted.
4. Purchase created directly as Delivered → stock is added immediately, same as today.
5. Payment status (Paid/Pending) keeps working exactly as now: it only controls the auto expense entry, never stock.

## Existing data

Only one purchase is currently Delivered and 25 are Pending. Their stock was already added under the old rule. Existing inventory quantities will be left untouched — no retroactive correction — so today's counts stay as they are and the new rule applies from now on.

## Small UI touch

Under the delivery dropdown in the purchase form and list, a short note: stock is added only when marked Delivered.

## Technical detail

- Replace the `AFTER INSERT ON purchase_items` behaviour in `handle_purchase_inventory_update()`: keep item-to-inventory linking and catalogue creation, but apply the quantity/stock_in only when the parent purchase's `delivery_status = 'delivered'`.
- Add a new trigger function on `purchases` (`AFTER UPDATE OF delivery_status`) that applies all of the purchase's items to inventory when moving into `delivered`, and reverses them when moving out of `delivered`.
- Add a guard column on `purchase_items` (e.g. `stock_applied boolean default false`) so apply/reverse is idempotent and cannot double count on repeated status flips.
- Inventory status (`in_stock` / `low_stock`) recalculated after each apply/reverse, same threshold as now.
- Purchase deletion of a delivered purchase reverses stock the same way.
- No changes to the purchase → expense logic.
