-- ============ helper: normalized phone ============
CREATE OR REPLACE FUNCTION public.normalize_phone_last10(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(RIGHT(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), 10), '')
$$;

-- ============ devices ============
CREATE TABLE public.call_recording_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_uuid text NOT NULL,
  device_model text,
  manufacturer text,
  android_version text,
  app_version text,
  app_version_code integer,
  recording_capability text NOT NULL DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'pending',
  battery_optimization_exempt boolean,
  permission_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_alive boolean,
  pending_events integer NOT NULL DEFAULT 0,
  pending_audio integer NOT NULL DEFAULT 0,
  consecutive_sync_failures integer NOT NULL DEFAULT 0,
  sim_slot_filter integer,
  staff_phone text,
  last_seen_at timestamptz,
  last_metadata_sync_at timestamptz,
  last_audio_sync_at timestamptz,
  last_call_detected_at timestamptz,
  session_revoked_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_recording_devices_device_uuid_key UNIQUE (device_uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_recording_devices TO authenticated;
GRANT ALL ON public.call_recording_devices TO service_role;

ALTER TABLE public.call_recording_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices"
  ON public.call_recording_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can register their own devices"
  ON public.call_recording_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage devices"
  ON public.call_recording_devices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete devices"
  ON public.call_recording_devices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_call_devices_user ON public.call_recording_devices (user_id);
CREATE INDEX idx_call_devices_status ON public.call_recording_devices (status, last_seen_at DESC);

CREATE TRIGGER trg_call_recording_devices_updated
  BEFORE UPDATE ON public.call_recording_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ call logs ============
CREATE TABLE public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  telecaller_id uuid,
  device_id uuid REFERENCES public.call_recording_devices(id) ON DELETE SET NULL,
  phone text,
  normalized_phone text,
  call_type text NOT NULL DEFAULT 'outgoing',
  status text NOT NULL DEFAULT 'initiated',
  source text NOT NULL DEFAULT 'crm',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  recording_path text,
  recording_uploaded_at timestamptz,
  recording_size_bytes bigint,
  sim_slot integer,
  match_method text,
  manually_assigned boolean NOT NULL DEFAULT false,
  duplicate_of uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT call_logs_client_uuid_key UNIQUE (client_uuid)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own call logs"
  ON public.call_logs FOR SELECT TO authenticated
  USING (telecaller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own call logs"
  ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (telecaller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update their own call logs"
  ON public.call_logs FOR UPDATE TO authenticated
  USING (telecaller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (telecaller_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete call logs"
  ON public.call_logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_call_logs_lead ON public.call_logs (lead_id);
CREATE INDEX idx_call_logs_telecaller ON public.call_logs (telecaller_id, started_at DESC);
CREATE INDEX idx_call_logs_norm_phone ON public.call_logs (normalized_phone, started_at DESC);
CREATE INDEX idx_call_logs_status ON public.call_logs (status, created_at DESC);
CREATE INDEX idx_call_logs_unmatched ON public.call_logs (created_at DESC) WHERE lead_id IS NULL;

CREATE TRIGGER trg_call_logs_updated
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- keep normalized_phone in sync
CREATE OR REPLACE FUNCTION public.set_call_log_normalized_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.normalized_phone := public.normalize_phone_last10(NEW.phone);
  IF NEW.started_at IS NULL THEN
    NEW.started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_call_logs_normalize
  BEFORE INSERT OR UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_call_log_normalized_phone();

-- ============ audit ============
CREATE TABLE public.call_log_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid REFERENCES public.call_logs(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.call_recording_devices(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.call_log_audit TO authenticated;
GRANT ALL ON public.call_log_audit TO service_role;

ALTER TABLE public.call_log_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view call audit"
  ON public.call_log_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can write call audit"
  ON public.call_log_audit FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_call_log_audit_call ON public.call_log_audit (call_log_id, created_at DESC);

-- ============ app releases ============
CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'android',
  version_name text NOT NULL,
  version_code integer NOT NULL,
  min_supported_version_code integer NOT NULL DEFAULT 1,
  apk_path text,
  changelog text,
  force_update boolean NOT NULL DEFAULT false,
  is_latest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_releases_platform_version_key UNIQUE (platform, version_code)
);

GRANT SELECT ON public.app_releases TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read releases"
  ON public.app_releases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert releases"
  ON public.app_releases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update releases"
  ON public.app_releases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete releases"
  ON public.app_releases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_app_releases_updated
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ unmatched calls view ============
CREATE VIEW public.call_logs_unmatched
WITH (security_invoker = true)
AS
  SELECT id, client_uuid, telecaller_id, device_id, phone, normalized_phone,
         call_type, status, started_at, ended_at, duration_seconds,
         recording_path, notes, created_at
    FROM public.call_logs
   WHERE lead_id IS NULL AND patient_id IS NULL;

GRANT SELECT ON public.call_logs_unmatched TO authenticated;
GRANT ALL ON public.call_logs_unmatched TO service_role;

-- ============ realtime ============
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;
ALTER TABLE public.call_recording_devices REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_recording_devices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;