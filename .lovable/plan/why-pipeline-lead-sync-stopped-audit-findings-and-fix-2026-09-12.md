# Why Pipeline lead sync stopped: audit findings and fix

## What I checked (read-only)

- The Meta connection itself: valid, never-expiring, correct app and page (Dr Neemz Dentistry), ad account attached.
- Lead form list from Meta: works. It reports lead counts, e.g. RCT Lead campaign 03/08/2026 = 663 leads, RCT Leads Campaign 13/06/2026 = 477, Dental Implants 01/09/2026 = 53, Metal Braces = 292.
- Actual lead download from Meta: returns **0 leads** for every form.
- Leads already stored in the CRM: newest is 11 Sep 2026. Nothing from 12 Sep.

## Diagnosis

There is no workflow problem and the token is not expired. The problem is a **missing permission** on the current token.

Two different Meta permissions are involved:

1. Reading campaigns, spend, impressions and the list of lead forms — the current token has these, which is why Connected Platforms shows "Leads: 1 / Leads: 2" (those are Meta's own campaign metrics) and campaigns load fine.
2. Downloading the actual lead rows (name, phone, email) from each form — this needs `leads_retrieval` (with `ads_management`). The saved token does **not** have it.

So Meta says "663 leads exist" but refuses to hand over the rows. The sync therefore inserts nothing and Pipeline stays at its last good state (11 Sep). "In range: 0" on the campaign cards is the same cause.

A second, smaller issue: the sync code hides these refusals. When Meta rejects a lead request it silently treats the form as empty, so the Pipeline "Sync Now" reports success with 0 new leads instead of showing the real error. It also reads only the newest 100 leads per form (200 on download), so forms with 477-663 leads can never fully backfill.

## Plan

1. **New token with lead access (needs you).** Generate a User access token on the Dr Neemz CRM app with the existing permissions **plus** `leads_retrieval` and `ads_management`, make it long-lived, and save it. I will store it and verify Meta actually returns lead rows.
2. **Stop hiding Meta errors.** In the lead sync, surface Meta's rejection message per form instead of returning an empty list, so "Sync Now" says "permission missing" rather than "0 new leads".
3. **Paginate lead fetching.** Follow Meta's paging so all leads per form are read, not just the newest 100/200 — this lets the older RCT and Metal Braces leads backfill.
4. **Verify.** Re-run Sync Now, confirm new lead count, and confirm the campaign cards show non-zero "In range" numbers for the selected period.

## Technical notes

- Files: `supabase/functions/meta-ads/index.ts` (`downloadLeads`, `sync_leads_to_crm` — error propagation and paging), no schema changes.
- Existing phone-based dedupe, workflow triggering, and campaign/insight logic stay untouched.
- Step 1 is a blocker: without `leads_retrieval` no code change can produce leads.
