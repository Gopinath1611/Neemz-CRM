# Lead-to-patient matching: check result and what to change

## What I checked (read-only)

The report already normalises phone numbers before matching: it strips every non-digit character and compares the **last 10 digits** (`last10` in `LeadGenerationReports.tsx`). So `+91`, spaces and dashes are already handled.

Sample check on this month's 302 leads:

| Matching method | Leads matched |
|---|---|
| Exact string compare (raw phone) | 20 |
| Normalised, last 10 digits (current logic) | 37 |

So normalisation is already giving the better number. No further match-rate gain is available from formatting — the remaining 265 are **genuinely not patients yet**.

Evidence, unmatched by lead stage:

| Lead stage | Total | Matched to a patient |
|---|---|---|
| Not clicking | 66 | 3 |
| Consultation booked | 64 | 28 |
| Partially looking | 48 | 1 |
| New lead | 44 | 1 |
| Interested | 27 | 2 |
| Callback | 23 | 1 |
| Not reachable | 17 | 1 |
| Not interested | 13 | 0 |

Almost all unmatched leads are enquiries that never reached the clinic (not clicking / not interested / not reachable / new). Only 36 "Consultation booked" leads have no patient record — those are real bookings where the patient was never registered, i.e. a front-desk data gap, not a matching bug.

Also: 0 leads have a phone shorter than 10 digits; 7 have an unusual digit length (not 10 or 12) and are counted as unmatched — negligible.

## Proposed change (display only)

Replace the alarming banner with an honest, informative one:

1. Reword to make clear the number is expected, not an error:
   "265 of 302 leads have no patient record yet — mostly enquiries that never visited. Phone numbers are already compared in normalised form (digits only, last 10)."
2. Add a small breakdown line inside the banner: how many of the unmatched leads are at a booked stage (36) versus non-visiting stages (229). The booked-but-unregistered count is the actionable number.
3. Change the banner tone from warning amber to neutral/info, keeping the amber highlight only when booked-but-unregistered is greater than zero.

## Technical notes

- Only `src/pages/reports/LeadGenerationReports.tsx` changes: the banner block plus one `useMemo` that counts unmatched leads split by booked vs non-booked stage, from data already fetched.
- No change to `last10`, the funnel maths, filters, pagination, queries, schema or any other module.
