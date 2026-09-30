# 04 — Clinic Workflow

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Flow
```
Check-in → Consultation → Treatment → Diagnostics → Ortho (optional)
       → Billing → Payment → Review Request → Checkout
```

## Step components (`src/components/workflow/`)
| Step | File | Writes |
|---|---|---|
| Check-in | `BookAppointmentStep.tsx` | `appointments`, `patient_checkins` |
| Consultation | (inline in `ClinicWorkflow.tsx`) | `patient_vitals`, `dental_charts`, `dental_chart_entries` |
| Treatment | `TreatmentSummary.tsx` | `treatment_plans`, `treatment_plan_items` |
| Diagnostics | `DiagnosticsStep.tsx` | `diagnostic_orders` |
| Ortho | `OrthoTreatmentStep.tsx` | `orthodontic_cases`, `orthodontic_visits` |
| Payment | `PaymentStep.tsx` | `billings`, `billing_items`, `billing_payments`, `inventory_items`, `inventory_transactions` |
| History | `HistoryStep.tsx` | reads only |

## Date anchoring
All steps stamp records with `workflowDate` (defaults to today, overrideable by staff for back-dated entry). See `mem://features/workflow-date-anchoring`.

## Persistence
Consultation form persists across re-check-ins for the same workflow day (see `mem://features/clinic-workflow-v2`).

## Hand-off to Finance
After `PaymentStep` writes complete, Finance.tsx will reflect:
- Outstanding ↓ on next load
- Collected ↑ if any `billing_payments` row was inserted (by `payment_date`)
- Revenue ↑ if a new `billings` row was inserted (by `created_at`)
