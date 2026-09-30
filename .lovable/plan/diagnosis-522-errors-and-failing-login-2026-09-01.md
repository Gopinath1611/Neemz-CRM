# Diagnosis: 522 errors and failing login

## What I checked (read-only)

| Check | Result |
|---|---|
| Backend lifecycle state (paused/suspended?) | Reported **healthy and active** — it is NOT paused or suspended |
| Env vars / keys in `.env` | Correct project URL + publishable (anon) key present, matching the live project. Nothing expired or misconfigured |
| Direct HTTPS call to the auth login endpoint | **HTTP 522 after ~20s** — Cloudflare page says "Browser: Working, Cloudflare: Working, **Host: Error**" |
| Direct HTTPS call to the data (REST) endpoint | **Timeout, no response** after 15s, repeated 3x |
| Direct SQL query through the pooler | **Connection pooler unavailable** |
| Database health metrics endpoint | Request timed out before returning anything |
| Edge function logs | Only normal boot/shutdown lines — **no application errors** |

## Root cause

This is an infrastructure-side outage, not an app or key problem.

The project's own gateway (the process that fronts auth, data API and the connection pooler) is accepting TCP connections but never completing requests, so Cloudflare returns 522 for every call — including login. The control plane still reports the project as "active", which is why nothing looks wrong from the dashboard side. Database metrics and the pooler are also unreachable, which points at the instance being resource-starved or wedged (typically memory pressure / connection saturation, or a stuck Postgres backend), rather than a network problem between the app and the backend.

Nothing in the app code causes this, and no code change can work around it. Your keys are fine — do NOT rotate them; rotating during an outage would only add a second failure mode.

## What to do — nothing on your end, one action on mine

The correct remedy is a backend restart, which clears the wedged gateway/pooler processes. That requires your explicit approval, so approving this plan authorizes exactly the following:

1. Restart the hosted backend.
2. Poll its status until it reports healthy again (usually 1-3 minutes; auth and data will be unavailable during that window).
3. Re-run the same three probes (auth login endpoint, data API read, direct SQL) to confirm requests complete instead of timing out.
4. If the pooler is still down after the restart, pull the database health snapshot to see whether disk or memory/connection saturation caused it, and recommend the matching resize (disk size vs. database server size).

If a restart does NOT bring it back, that indicates a fault below the self-serve layer and the next step is contacting support — I'll tell you plainly if we reach that point.

## Explicitly out of scope

- No code changes, no migrations, no writes while the backend is degraded.
- No key rotation and no `.env` edits — the current values are correct.
