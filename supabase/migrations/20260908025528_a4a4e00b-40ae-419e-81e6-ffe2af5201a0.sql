ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS send_context jsonb,
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS workflow_run_id uuid,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS stage_from text,
  ADD COLUMN IF NOT EXISTS stage_to text,
  ADD COLUMN IF NOT EXISTS message_kind text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS patient_id uuid;

CREATE INDEX IF NOT EXISTS idx_wa_msg_created_module ON public.whatsapp_messages (created_at, module);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created_workflow ON public.whatsapp_messages (created_at, workflow_id);
CREATE INDEX IF NOT EXISTS idx_wa_msg_created_appointment ON public.whatsapp_messages (created_at, appointment_id);

CREATE OR REPLACE FUNCTION public.whatsapp_send_breakdown(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  module text,
  category text,
  workflow_id uuid,
  workflow_name text,
  campaign_id uuid,
  campaign_name text,
  stage_to text,
  message_kind text,
  template_name text,
  total bigint,
  unique_recipients bigint,
  delivered bigint,
  failed bigint,
  unique_appointments bigint,
  unique_leads bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      m.id,
      COALESCE(
        NULLIF(m.module, ''),
        CASE
          WHEN COALESCE(m.payload->'request'->>'source', '') IN ('workflow', 'campaign', 'camp_coupon_pdf') THEN 'marketing'
          WHEN COALESCE(m.payload->'request'->>'source', '') = 'single_send' THEN 'manual'
          ELSE 'unattributed'
        END
      ) AS module,
      COALESCE(NULLIF(lower(m.payload->'request'->'template'->>'name'), ''), 'no-template') AS template_name,
      m.workflow_id,
      m.campaign_id,
      COALESCE(NULLIF(m.stage_to, ''), 'unknown') AS stage_to,
      m.message_kind,
      m.appointment_id,
      m.lead_id,
      lower(COALESCE(m.status, '')) AS status,
      COALESCE(m.payload->'request'->>'to', '') AS recipient
    FROM public.whatsapp_messages m
    WHERE m.direction IS DISTINCT FROM 'in'
      AND m.created_at >= _from
      AND m.created_at <= _to
  ), classified AS (
    SELECT
      b.*,
      CASE
        WHEN b.template_name ~ 'appointment|app_booking' THEN 'appointment'
        WHEN b.template_name ~ 'check[-_]?in' THEN 'checkin'
        WHEN b.template_name ~ 'check[-_]?out' THEN 'checkout'
        WHEN b.template_name ~ 'prescription' THEN 'prescription'
        WHEN b.template_name ~ 'invoice|^inv[-_]|payment_sharing' THEN 'invoice'
        WHEN b.module = 'marketing' THEN 'automation'
        ELSE 'other'
      END AS category,
      COALESCE(
        NULLIF(b.message_kind, ''),
        CASE
          WHEN b.template_name ~ 'remind' THEN 'reminder'
          WHEN b.template_name ~ 'reschedul' THEN 'reschedule'
          WHEN b.template_name ~ 'cancel' THEN 'cancellation'
          WHEN b.template_name ~ 'follow' THEN 'followup'
          WHEN b.template_name ~ 'appointment|app_booking' THEN 'booking'
          WHEN b.template_name ~ 'review' THEN 'review'
          WHEN b.template_name ~ 'check[-_]?in' THEN 'checkin'
          WHEN b.template_name ~ 'check[-_]?out' THEN 'checkout'
          WHEN b.template_name ~ 'prescription' THEN 'prescription'
          WHEN b.template_name ~ 'invoice|payment_sharing' THEN 'invoice'
          ELSE 'other'
        END
      ) AS kind
    FROM base b
  )
  SELECT
    c.module,
    c.category,
    c.workflow_id,
    w.name AS workflow_name,
    c.campaign_id,
    cp.name AS campaign_name,
    c.stage_to,
    c.kind AS message_kind,
    c.template_name,
    count(*)::bigint AS total,
    count(DISTINCT NULLIF(c.recipient, ''))::bigint AS unique_recipients,
    count(*) FILTER (WHERE c.status IN ('delivered', 'read'))::bigint AS delivered,
    count(*) FILTER (WHERE c.status IN ('failed', 'undeliverable', 'undelivered'))::bigint AS failed,
    count(DISTINCT c.appointment_id)::bigint AS unique_appointments,
    count(DISTINCT c.lead_id)::bigint AS unique_leads
  FROM classified c
  LEFT JOIN public.workflows w ON w.id = c.workflow_id
  LEFT JOIN public.campaigns cp ON cp.id = c.campaign_id
  GROUP BY c.module, c.category, c.workflow_id, w.name, c.campaign_id, cp.name, c.stage_to, c.kind, c.template_name
$$;

REVOKE ALL ON FUNCTION public.whatsapp_send_breakdown(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_breakdown(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_breakdown(timestamptz, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_send_duplicates(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  scope text,
  ref_id uuid,
  recipient text,
  message_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'appointment'::text, m.appointment_id, max(COALESCE(m.payload->'request'->>'to', '')), count(*)::bigint
  FROM public.whatsapp_messages m
  WHERE m.direction IS DISTINCT FROM 'in' AND m.appointment_id IS NOT NULL
    AND m.created_at >= _from AND m.created_at <= _to
  GROUP BY m.appointment_id
  HAVING count(*) > 1
  UNION ALL
  SELECT 'lead'::text, m.lead_id, max(COALESCE(m.payload->'request'->>'to', '')), count(*)::bigint
  FROM public.whatsapp_messages m
  WHERE m.direction IS DISTINCT FROM 'in' AND m.lead_id IS NOT NULL
    AND m.created_at >= _from AND m.created_at <= _to
  GROUP BY m.lead_id
  HAVING count(*) > 1
$$;

REVOKE ALL ON FUNCTION public.whatsapp_send_duplicates(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_duplicates(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_send_duplicates(timestamptz, timestamptz) TO service_role;