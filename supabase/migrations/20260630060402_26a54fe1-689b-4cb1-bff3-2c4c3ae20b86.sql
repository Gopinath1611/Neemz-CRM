
-- ============================================================
-- 1. Add cache + treatment-plan link columns (all nullable / safe defaults)
-- ============================================================
ALTER TABLE public.consultation_findings
  ADD COLUMN IF NOT EXISTS current_status text NOT NULL DEFAULT 'active'
    CHECK (current_status IN ('active','continuing','monitoring','resolved','recurred','reopened','closed')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS linked_treatment_plan_item_id uuid
    REFERENCES public.treatment_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cf_patient_active
  ON public.consultation_findings(patient_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cf_link_tx_item
  ON public.consultation_findings(linked_treatment_plan_item_id);

-- ============================================================
-- 2. Trigger: keep cache columns in sync from history (append-only).
--    Source of truth = finding_status_history. Cache is derived only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_finding_cache_from_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.consultation_findings
     SET current_status = NEW.new_status,
         is_active = (NEW.new_status NOT IN ('resolved','closed')),
         last_updated_at = NEW.event_date
   WHERE id = NEW.finding_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_finding_cache ON public.finding_status_history;
CREATE TRIGGER trg_refresh_finding_cache
AFTER INSERT ON public.finding_status_history
FOR EACH ROW EXECUTE FUNCTION public.refresh_finding_cache_from_history();

-- ============================================================
-- 3. Backfill cache for any findings already in the table
-- ============================================================
WITH latest AS (
  SELECT DISTINCT ON (finding_id)
         finding_id, new_status, event_date
    FROM public.finding_status_history
   ORDER BY finding_id, event_date DESC, created_at DESC
)
UPDATE public.consultation_findings f
   SET current_status = l.new_status,
       is_active = (l.new_status NOT IN ('resolved','closed')),
       last_updated_at = l.event_date
  FROM latest l
 WHERE l.finding_id = f.id;
