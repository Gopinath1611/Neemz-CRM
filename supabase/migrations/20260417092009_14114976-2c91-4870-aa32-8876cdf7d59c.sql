ALTER TABLE public.content_calendar
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'education',
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS script_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS script_by text,
  ADD COLUMN IF NOT EXISTS shoot_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shoot_by text,
  ADD COLUMN IF NOT EXISTS edit_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS edit_by text,
  ADD COLUMN IF NOT EXISTS post_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS posted_by text,
  ADD COLUMN IF NOT EXISTS remarks text;