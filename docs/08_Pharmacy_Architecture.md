# 08 — Pharmacy Architecture

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Tables
- `medicines` — master (with batch, expiry, GST)
- `medicine_dosages` — dosage presets
- `prescriptions`, `prescription_items` — patient scripts
- `prescription_templates`, `prescription_template_items` — reusable templates
- `inventory_items` — pharmacy stock subset

## Flow
```
Prescription written → prescription_items inserted
       │
       └─► (Manual dispense) → inventory_items.qty ↓ (no auto billings row)
```

## Critical gap
Pharmacy dispensing currently **does not create a `billings`/`billing_payments` row**. As a result:
- Pharmacy revenue is invisible to `Finance.tsx`
- Cost of goods sold for pharmacy is not booked
- Reconciliation against vendor purchases is manual

See `05_Finance_Architecture.md` §17.6 (Impact Matrix) and §11 (Architecture Issues).

## UI surfaces
- `Pharmacy.tsx` — list, dispense
- Prescription is created inside `ClinicWorkflow → TreatmentSummary`
