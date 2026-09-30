# Push Screening Lead to CRM Pipeline

## Goal
Add a "Push to Pipeline" quick action on each row of the Screening Leads table (Sales & Marketing → Offline Campaigns → Screening Leads) that copies the screening lead into the main `public.leads` (Pipeline) table for sales follow-up.

## File touched
- `src/pages/OfflineCampaigns.tsx` (only file modified)

## Changes

### 1. Row action
- In the Screening Leads table action cell (currently: Edit, Generate Follow-ups, Delete), add a ghost-icon button **"Push to Pipeline"** using the existing `TrendingUp` icon (already imported), placed before the Delete button.
- Track a `pushingLeadId` state so the clicked row shows a brief loading spinner/disabled state while syncing.

### 2. `pushToPipeline(lead: ScreeningLead)` handler
- **Duplicate guard:** check `public.leads` for an existing row with the same `phone` and `meta_form_name` (camp name). If found, show an info toast ("Lead already exists in Pipeline") and stop.
- **Field mapping** on insert into `public.leads`:
  - `name` ← `participant_name`
  - `phone` ← `mobile`
  - `treatment_interest` ← first of `treatment_tags` (fallback: `recommended_treatment`)
  - `source` ← `"Offline Camp"`
  - `meta_form_name` ← the campaign name (looked up from `campaigns` via `lead.campaign_id`)
  - `status` ← `"new_lead"`
  - `age`, `email`, `city` ← mapped from the screening lead where available (`city` ← `institution_name`)
  - `dental_problem` ← `chief_complaint` (+ `screening_findings` appended)
  - `notes` ← camp context note, e.g. `"Screening lead from camp <name> — Examined by <doctor_name>"`
- **Success toast:** `"Added to Pipeline" — "<Name> is now in the CRM Pipeline for sales follow-up."` (subtle, default variant).
- **Error toast:** destructive variant with the error message.
- No schema changes — all target columns already exist on `public.leads` and RLS already permits authenticated inserts.

## Out of scope
- No database migrations.
- No changes to `generateFollowups`, coupon, or campaign tabs.
- No new lead owner assignment (sales team assigns from Pipeline as usual).
