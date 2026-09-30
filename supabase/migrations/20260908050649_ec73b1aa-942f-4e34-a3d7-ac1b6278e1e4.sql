CREATE OR REPLACE FUNCTION public.whatsapp_send_breakdown(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(module text, category text, raw_source text, workflow_id uuid, workflow_name text, campaign_id uuid, campaign_name text, source_kind text, name_matched boolean, stage_to text, message_kind text, template_name text, total bigint, unique_recipients bigint, delivered bigint, failed bigint, unique_appointments bigint, unique_leads bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      m.id,
      m.created_at,
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
      COALESCE(m.send_context->>'workflow_name', '') AS ctx_workflow_name,
      COALESCE(NULLIF(m.stage_to, ''), 'unknown') AS stage_to,
      m.message_kind,
      m.appointment_id,
      m.lead_id,
      lower(COALESCE(m.status, '')) AS status,
      COALESCE(m.payload->'request'->>'to', '') AS recipient,
      right(regexp_replace(COALESCE(m.payload->'request'->>'to', ''), '\D', '', 'g'), 10) AS phone10,
      date_trunc('minute', m.created_at) AS minute_bucket
    FROM public.whatsapp_messages m
    WHERE m.direction IS DISTINCT FROM 'in'
      AND m.created_at >= _from
      AND m.created_at <= _to
  ), runs AS (
    SELECT DISTINCT
      r.workflow_id,
      w.name AS workflow_name,
      right(regexp_replace(COALESCE(r.contact_phone, ''), '\D', '', 'g'), 10) AS phone10,
      lower(btrim(split_part(r.step, '→', 2))) AS tpl,
      date_trunc('minute', r.created_at) AS minute_bucket
    FROM public.workflow_runs r
    JOIN public.workflows w ON w.id = r.workflow_id
    WHERE r.created_at >= _from - interval '3 minutes'
      AND r.created_at <= _to + interval '3 minutes'
      AND r.step LIKE 'WhatsApp template sent%'
  ), runs_exp AS (
    SELECT DISTINCT
      rr.workflow_id, rr.workflow_name, rr.phone10, rr.tpl,
      rr.minute_bucket + (o || ' minutes')::interval AS minute_bucket
    FROM runs rr, unnest(ARRAY[-1, 0, 1]) AS o
    WHERE rr.phone10 <> '' AND rr.tpl <> ''
  ), matched AS (
    SELECT DISTINCT ON (b.id)
      b.*,
      rx.workflow_id AS matched_workflow_id,
      rx.workflow_name AS matched_workflow_name
    FROM base b
    LEFT JOIN runs_exp rx
      ON b.workflow_id IS NULL
     AND b.campaign_id IS NULL
     AND b.raw_source = 'workflow'
     AND b.template_name <> 'no-template'
     AND rx.phone10 = b.phone10
     AND rx.tpl = b.template_name
     AND rx.minute_bucket = b.minute_bucket
    ORDER BY b.id
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
    FROM matched b
  )
  SELECT
    c.module,
    c.category,
    c.raw_source,
    COALESCE(c.workflow_id, c.matched_workflow_id) AS workflow_id,
    COALESCE(w.name, NULLIF(c.ctx_workflow_name, ''), c.matched_workflow_name) AS workflow_name,
    c.campaign_id,
    cp.name AS campaign_name,
    CASE
      WHEN c.workflow_id IS NOT NULL OR c.matched_workflow_id IS NOT NULL THEN 'workflow'
      WHEN c.campaign_id IS NOT NULL OR c.raw_source IN ('campaign', 'camp_coupon_pdf') THEN 'campaign'
      WHEN c.raw_source = 'workflow' THEN 'unknown_workflow'
      ELSE 'manual'
    END AS source_kind,
    (c.workflow_id IS NULL AND c.matched_workflow_id IS NOT NULL) AS name_matched,
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
  GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12
$function$;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON public.workflow_runs (created_at);