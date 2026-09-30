# Roadmap

- [x] Vendor Payables redesign (approved plan)
  - [x] Migration: lab_orders.lab_expense_paid_date, purchases.payment_paid_date + amount_paid (backfill paid)
  - [x] Regenerate types
  - [x] Finance.tsx: fLabPayables memo (delivered-only, actual_delivery_date), rewrite vendorPayments()
  - [x] VendorSection: 3 cards, status filter, 6-col tables
  - [x] Drill-down + PDF statement same logic; Record Payment action
  - [x] Typecheck + live verify

- [x] Call Logs period panels
  - [x] Shared Today / Yesterday / Last Week metrics panels
  - [x] One combined period fetch and synchronized refresh
  - [x] Typecheck and responsive live verification

- [x] Add Lab Order (Backfill) + Possibly Missed list
  - [x] Migration: lab_order_backfill_dismissals (patient+billing, dismissed_by/at)
  - [x] Shared buildLabOrderRow used by Clinic Workflow + backfill form
  - [x] Backfill dialog: patient picker, lab/work/status/dates/money, invoice + check-in link, duplicate warning
  - [x] Possibly Missed view with DB-persisted Dismiss
  - [x] Typecheck + live verify (crash fix: patient_code numeric)

- [x] Receivables "Adjust" feature (approved plan)
  - [ ] Migration: receivable_adjustments table + RLS + unique reversal index (show SQL first)
  - [ ] Regenerate types
  - [x] Finance.tsx ReceivablesSection: Action column (Adjust + History), Adjusted tab, Adj badge, admin gate
  - [x] Adjusted pending maths local to Receivables only; note under summary cards
  - [ ] History dialog with one-time Reverse
  - [ ] Typecheck + live verify

- [ ] Callyzer integration (raw call log sync)
  - [ ] Migration: call_logs cols (callyzer_log_id, raw_call_type, callyzer_environment), callyzer_settings, callyzer_employee_mappings, callyzer_webhook_logs + 30-day cleanup
  - [ ] Secrets: CALLYZER_API_TOKEN_SANDBOX/PROD (user), CALLYZER_WEBHOOK_TOKEN (generated)
  - [ ] Edge fns: callyzer-webhook, callyzer-backfill, callyzer-compare
  - [ ] Settings UI: Callyzer card + Integrations section (env switch, base URLs, mappings, android toggle, backfill, webhook logs, compare card admin-only)
  - [ ] Call Logs: source badge + Unmatched calls list; recording URLs admin-only
- [x] Call Logs list: filters (date/telecaller/call-type chips), search, clickable tiles, admin CSV export, empty states

- [x] HRMS Inbox static UI
  - [x] Sidebar Inbox menu after Home with three submenus
  - [x] Leaves, Comp off request, and Expenses & reimbursements routes
  - [x] Shared request tabs and responsive empty states only
