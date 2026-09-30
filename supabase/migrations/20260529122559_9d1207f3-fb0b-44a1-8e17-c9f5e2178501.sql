ALTER TABLE public.user_module_access
  ADD COLUMN IF NOT EXISTS can_read boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;

-- Backfill existing rows: where has_access=true, grant full CRUD by default so existing staff keep working
UPDATE public.user_module_access
   SET can_read = true, can_create = true, can_edit = true, can_delete = true
 WHERE has_access = true
   AND can_create = false AND can_edit = false AND can_delete = false;