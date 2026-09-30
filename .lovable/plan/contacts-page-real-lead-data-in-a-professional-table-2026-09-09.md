# Contacts page: real lead data in a professional table

Today the Contacts page shows 6 hard-coded sample people (Priya Sharma, Rajesh Kumar, etc.) in cards. Nothing on it is real. This replaces it with the actual leads already shown on Pipeline, in a clean table.

## What the page will show

A full-width table with these columns:

| Name | Phone | Email | Location | Source | Treatment | Actions |

- **Name** — initials avatar + full name (stage shown as a small label under the name).
- **Phone** — formatted number, with a call icon and a WhatsApp icon.
- **Email** — email, or a dash when blank.
- **Location** — city/area, or a dash.
- **Source** — coloured source badge, exactly the same colours Pipeline uses (Meta Ads, Google Ads, Website, Referral, Walk-in, Dental Camp…).
- **Treatment** — interested treatment badge.
- **Actions** — "View in Pipeline" (opens Pipeline focused on that person) and Edit.

## Search, filters, paging

- The existing "Search contacts…" box filters live across name, phone and email.
- Two dropdown filters: **Source** and **Treatment**, built from the values that actually exist in the data (no invented options), plus "All".
- Page count shown as "Showing X–Y of Z contacts", 25 rows per page, with Previous/Next. This keeps hundreds of rows fast without a virtual-scroll library.
- A "Clear filters" action appears when any filter or search is active.

## Loading and empty states

- While loading: skeleton rows in the table shape (not a spinner, no layout jump).
- No data at all: "No contacts yet" with the Add Contact action.
- Filters exclude everything: "No contacts match your search" with a clear-filters button.

## Add Contact

The existing Add Contact button currently does nothing. It will open the same add-lead form fields Pipeline uses (name, phone, email, city, treatment, source), saving into the same leads data — so a contact added here shows up on Pipeline too.

## Technical notes

- Data: `supabase.from("leads").select("*")` via React Query, reusing Pipeline's exact fetch shape — paged in chunks of 1000 (Supabase caps one request at 1000 rows), same created-at cutoff, same Meta-form filter that drops Meta leads whose form isn't tied to an active automation. Same `refetchInterval: 30000`. Query key kept separate (`contacts-leads`) so Pipeline's cache is untouched.
- Reuses `sourceColors` styling and the shadcn `Table`, `Badge`, `Select`, `Skeleton` primitives so the look matches `Pipeline.tsx` / `Purchases.tsx`.
- Phone display uses the shared `displayPhone` helper already in `src/lib/utils.ts`; WhatsApp link uses `wa.me` with digits only.
- Filtering, sorting and paging happen in memory on the fetched rows (same approach as Pipeline).

## Guardrails

- Only `src/pages/Contacts.tsx` changes.
- No database, storage, permission or edge-function changes; no new tables or columns.
- No changes to Pipeline, Purchases, WhatsApp sending/dedupe/quota, the pipeline stage guard, or the Social inbox work.
- Read + insert only; no bulk edits or deletes on this page.
