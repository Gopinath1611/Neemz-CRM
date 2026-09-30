# Audit: EMI & Insurance — blank Patient Name

Read-only audit. No code, query, or data changes made.

## 1. Current data flow

```text
emi_insurance_cases.patient_id (uuid)
        |
        v
client-side Map built from a separate patients fetch  (src/pages/EMIInsurance.tsx, load())
        |
        v
case.patient  -> getPatientName(patient)
        |
        v
Table cell: name or "—"
```

There is no SQL join. The page fetches cases and patients as two independent requests and stitches them together in JavaScript.

## 2. Database findings

- `emi_insurance_cases.patient_id` stores the patient **UUID** (not a patient code).
- Verified counts: 23 cases, 2,721 patients.
  - Cases with `patient_id IS NULL`: **0**
  - Cases whose `patient_id` has no matching `patients` row (orphans): **0**
  - Matched patients with an empty first+last name: **0**
- So every EMI case resolves to a real patient with a real name in the database. The relationship is intact; nothing is broken, missing, or nullable-empty at the data layer.

## 3. Query findings

In `load()`:
- `emi_insurance_cases` → `select("*")`, ordered by `created_at desc`. No embedded patient relation.
- `patients` → `select("id, first_name, last_name, phone, patient_code").order("first_name").limit(10000)`.
- Patient name is not selected from the cases query and is not returned by any other API; it is mapped client-side via `ptMap.get(c.patient_id)`.

## 4. Frontend mapping findings

- Name cell: `getPatientName(c.patient)` — returns `"—"` whenever `c.patient` is undefined or both name fields are empty.
- ID cell: `formatPatientCode(c.patient?.patient_code)`, falling back to `c.patient_id.slice(0, 8)` when the patient object is missing. That fallback is exactly why the affected rows show a raw hash such as `dac1118e` instead of `PT####` — a reliable tell that the patient object was never attached.
- Rendering logic is correct for the data it receives; it is receiving `undefined`.

## 5. Root cause

The `patients` fetch is silently truncated. Although the client asks for `.limit(10000)`, the Data API enforces a server-side maximum of **1,000 rows** per request. With `order("first_name")`, only the alphabetically first 1,000 of 2,721 patients arrive, so `ptMap` covers roughly the first third of the patient list.

Confirmed by ranking each EMI case's patient by `first_name`:

| Case | Patient | Alphabetical rank | Renders? |
|---|---|---|---|
| EMI-00028 | G.Saravanan | 504 | yes |
| EMI-00030 | R.Kumari | 1641 | blank |
| EMI-00029 | S.Ajith Kumar | 1857 | blank |
| EMI-00025 | V.Gayathri | 2521 | blank |
| EMI-00007 | A.Sankar | 44 | yes |

Every case whose patient ranks above ~1000 is blank; every case below renders. The cut-off matches the row cap exactly.

Classification: **not** missing data, **not** a broken relationship, **not** a rendering bug, **not** a migration issue. It is a client-side join fed by a truncated bulk fetch — an incomplete-lookup-dataset issue.

## 6. Missing relationships

None missing in the schema. What is missing is the join at query time: the list relies on loading the entire patient master into memory instead of resolving names alongside the 23 cases.

## 7. Data consistency observations

- All 23 cases have valid, non-null patient references.
- Many patients store the full name in `first_name` with an empty `last_name` (e.g. "G.Saravanan"); `getPatientName` handles this correctly.
- The same 1,000-row truncation also affects the `patients` array used by the "New Case" patient dropdown — its dedicated search queries mitigate that, but the default (unsearched) list is likewise capped.

## 8. Recommended fix approach (high level, not implemented)

1. Resolve names against the cases actually being displayed rather than the whole patient table — either an embedded patient selection on the cases query, or a targeted fetch filtered to the case `patient_id` set. Both stay well under the row cap.
2. Alternatively, if the full patient list must stay client-side, paginate the fetch in 1,000-row batches instead of a single capped request.
3. Change the empty-name fallback from `"—"` to `"Unknown Patient"` so a genuinely unresolvable reference is visually distinct from a lookup gap.
4. Optionally audit other screens that bulk-load `patients` with a single high `.limit()`; they share the same truncation exposure.
