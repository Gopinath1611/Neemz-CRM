# 02 — System Architecture

**Doc Version:** v2.0 · **Generated:** 2026-06-30

## Layers
```
React Pages/Components
        │
React Query / useEffect / Context (Auth, Branch)
        │
@/integrations/supabase/client  (PostgREST + Auth + Storage + Realtime)
        │
Postgres (RLS enforced)  ──►  Triggers  ──►  Derived tables (fy_actual_tracking, ...)
        │
Edge Functions (create-staff-user, manage-admin-users, marketing/* — none touch finance writes)
```

## Cross-cutting concerns
- **Auth:** Supabase JWT (`AuthContext`). Roles in `user_roles` table; checked via `has_role()` SECURITY DEFINER function. Never on `profiles`.
- **Branch:** `BranchContext` + `user_branches`. Money tables currently lack `branch_id` (see Finance §11).
- **RLS:** Every public table. `authenticated` role has CRUD on operational tables; `service_role` for edge functions.
- **Date anchoring:** All workflow records use `workflowDate` (see `mem://features/workflow-date-anchoring`).
- **Title-case auto-format:** Names, treatments, medicines.

## Folder map
```
src/
  pages/             route-level screens
  components/        shared + feature components
  contexts/          AuthContext, BranchContext
  hooks/             useFYData, useFYTable, useClinicMasters, ...
  integrations/      supabase/client.ts (auto-gen)
  lib/               helpers (exportAnalytics, pdfGenerators, fyProjection, ...)
supabase/
  functions/         edge functions
  config.toml        (auto-gen)
docs/                this documentation
```

## Build & deploy
- `bun run dev` (Vite, port 8080).
- `bun run build` (Vite production build).
- Deploy via Lovable Publish.
