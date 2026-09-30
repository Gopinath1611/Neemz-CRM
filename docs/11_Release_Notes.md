# 11 — Release Notes

## v2.0 — 2026-06-30
- Added full project documentation suite under `docs/` (01–11 + diagrams).
- `05_Finance_Architecture.md` supersedes `Finance_Architecture_Audit.md` (v1.0). Adds sections 15 SQL/Data Access Audit, 16 Impact Matrix (renumbered), 18 Version Metadata, 19 Regeneration Guide, and a richer Data Lineage Matrix.
- Enhanced `/system-documentation` viewer: document picker, table of contents, in-doc search, mermaid diagram rendering, toolbar (PDF, DOCX, Copy, Print, Reload), version history panel.
- Added `docs/diagrams/*.mmd` Mermaid sources.
- Added `docs/VERSIONS.json` for the viewer's version-history panel.
- No business logic, schema, RLS, trigger, or calculation changes.

## v1.0 — 2026-06-30
- Initial Finance Architecture Audit (`docs/Finance_Architecture_Audit.md`).
- Initial `/system-documentation` viewer page (read-only).
- Identified 5 key risks: no branch_id on money tables; no void/refund status on billing_payments; on-demand FY actuals; dual collected paths; pharmacy revenue not booked.

## v2.1 — Consultation Findings Lifecycle (additive)

- New table `consultation_findings` (immutable per-finding record) + `finding_status_history` (append-only timeline, no UPDATE/DELETE policy = tamper-proof audit log).
- Trigger seeds an `active` event on every new finding.
- Consultation step now shows an "Existing Findings (from previous visits)" panel with one-click `Continue Tx / Monitor / Resolved / Recurred` actions; every action inserts a new history row.
- Patient History gains a "Findings Timeline" card.
- New page `Oral Status Lookup` (`/current-oral-status/:patientId`) shows Active vs Resolved findings plus full timeline.
- No existing table, column, policy, trigger, or workflow was modified. Rollback = drop the two new tables.

## v2.2 — Lifecycle production optimizations (additive)

**Schema (no destructive change):**
- `consultation_findings` gained three cache columns (`current_status`, `is_active`, `last_updated_at`) + `linked_treatment_plan_item_id` (nullable FK → `treatment_plan_items`).
- New trigger `trg_refresh_finding_cache` keeps cache in sync from `finding_status_history` (the only source of truth).
- Existing history rows are NEVER modified. Append-only semantics preserved.

**Application:**
- `Current Oral Status` and `Existing Findings` panels now read the cache (O(1) per patient), no join with history required.
- Duplicate detection: looks up the latest finding per (patient, tooth, surface, condition).
  - `is_active = true` → skip.
  - latest is `resolved`/`closed` → INSERT new finding AND set `parent_finding_id` to the closed one, then append a `recurred` event so the timeline reflects the recurrence.
- `linked_treatment_plan_item_id` is ready for future workflow integrations (Treatment Done / Pending / Reports). Currently nullable, unused by existing code.

**Compatibility:**
- All new columns nullable or have safe defaults; backfill performed in-migration.
- Finance, Billing, Inventory, Pharmacy, Reports untouched.
- Rollback = drop the new columns and trigger.
