DROP FUNCTION IF EXISTS public.whatsapp_send_breakdown(timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.whatsapp_send_breakdown(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(module text, category text, raw_source text, workflow_id uuid, workflow_name text, campaign_id uuid, campaign_name text, stage_to text, message_kind text, template_name text, total bigint, unique_recipients bigint, delivered bigint, failed bigint, unique_appointments bigint, unique_leads bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
      COALESCE(NULLIF(lower(m.payload->'request'->>'source'), ''), 'none') AS raw_source,
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
    c.raw_source,
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
  GROUP BY c.module, c.category, c.raw_source, c.workflow_id, w.name, c.campaign_id, cp.name, c.stage_to, c.kind, c.template_name
$function$;

CREATE OR REPLACE FUNCTION public.whatsapp_template_duplicate_recipients(
  _from timestamp with time zone,
  _to timestamp with time zone,
  _module text DEFAULT NULL,
  _template text DEFAULT NULL,
  _workflow uuid DEFAULT NULL,
  _campaign uuid DEFAULT NULL
)
 RETURNS TABLE(recipient text, message_count bigint, first_at timestamp with time zone, last_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(m.payload->'request'->>'to', '') AS recipient,
    count(*)::bigint AS message_count,
    min(m.created_at) AS first_at,
    max(m.created_at) AS last_at
  FROM public.whatsapp_messages m
  WHERE m.direction IS DISTINCT FROM 'in'
    AND m.created_at >= _from
    AND m.created_at <= _to
    AND COALESCE(m.payload->'request'->>'to', '') <> ''
    AND (
      _module IS NULL
      OR (_module = 'unattributed' AND (m.module IS NULL OR m.module = ''))
      OR m.module = _module
    )
    AND (
      _template IS NULL
      OR COALESCE(NULLIF(lower(m.payload->'request'->'template'->>'name'), ''), 'no-template') = lower(_template)
    )
    AND (_workflow IS NULL OR m.workflow_id = _workflow)
    AND (_campaign IS NULL OR m.campaign_id = _campaign)
  GROUP BY 1
  HAVING count(*) > 1
  ORDER BY count(*) DESC
  LIMIT 200
$function$;

GRANT EXECUTE ON FUNCTION public.whatsapp_send_breakdown(timestamp with time zone, timestamp with time zone) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_template_duplicate_recipients(timestamp with time zone, timestamp with time zone, text, text, uuid, uuid) TO authenticated, anon;