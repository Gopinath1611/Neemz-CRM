# 09 — API Documentation

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## No custom REST layer
All data access uses **Supabase PostgREST** via `@/integrations/supabase/client`. There is no Express/Fastify backend. Business rules live in DB triggers or component code.

## Client usage pattern
```ts
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase
  .from("billing_payments")
  .select("id, amount, payment_date, billing:billings(patient_id, patients(name))")
  .gte("payment_date", from)
  .lte("payment_date", to)
  .order("payment_date", { ascending: false });
```

## Edge Functions
| Function | Purpose | Touches finance? |
|---|---|---|
| `create-staff-user` | Provision staff with role | No |
| `manage-admin-users` | Admin CRUD | No |
| `meta-ads`, `social-inbox`, `social-reply` | Marketing | No |
| `platform-insights`, `verify-platform-connection` | Integrations | No |
| `smile-design-ai` | AI image | No |
| `whatsapp-live-insights` | WA dashboard | No |

**None of the edge functions write to money tables.** All financial writes originate from the React client.

## Auth
- JWT via Supabase Auth.
- Provider: Email/Password + Google OAuth.
- Roles in `user_roles`, checked via `has_role(uuid, app_role)`.

## Realtime
Not currently used for money tables. Finance.tsx polls on mount + filter change.

## Rate limits / quotas
Inherited from Lovable Cloud defaults.
