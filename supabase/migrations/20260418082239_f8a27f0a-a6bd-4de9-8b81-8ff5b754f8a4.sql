CREATE TABLE public.licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_name TEXT NOT NULL,
  vendor TEXT,
  license_type TEXT,
  account_email TEXT,
  seats INTEGER DEFAULT 1,
  cost NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  purchase_date DATE,
  license_start_date DATE,
  expiry_date DATE NOT NULL,
  reminder_days INTEGER NOT NULL DEFAULT 15,
  auto_renew BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_licenses_expiry ON public.licenses(expiry_date);
CREATE INDEX idx_licenses_status ON public.licenses(status);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view licenses"
  ON public.licenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert licenses"
  ON public.licenses FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update licenses"
  ON public.licenses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete licenses"
  ON public.licenses FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_licenses_updated_at
  BEFORE UPDATE ON public.licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();