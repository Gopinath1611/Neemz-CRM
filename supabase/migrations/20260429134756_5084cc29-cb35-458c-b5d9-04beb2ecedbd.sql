-- Storage bucket for AI smile design photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('smile-design', 'smile-design', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for smile-design bucket
CREATE POLICY "Smile design images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'smile-design');

CREATE POLICY "Authenticated users can upload smile design images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'smile-design');

CREATE POLICY "Authenticated users can update smile design images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'smile-design');

CREATE POLICY "Authenticated users can delete smile design images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'smile-design');

-- Main simulations table
CREATE TABLE public.smile_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name text,
  doctor text,
  
  -- Captured photos (urls)
  face_photo_url text,
  smile_photo_url text,
  intraoral_photos jsonb DEFAULT '[]'::jsonb,
  occlusal_photos jsonb DEFAULT '[]'::jsonb,
  
  -- AI tooth detection result (FDI -> condition/notes)
  detected_teeth jsonb DEFAULT '[]'::jsonb,
  
  -- Treatment plan: array of { tooth, treatment, notes, shade, brand }
  treatment_plan jsonb DEFAULT '[]'::jsonb,
  
  -- Generated simulation
  before_image_url text,
  after_image_url text,
  simulation_mode text DEFAULT 'ai', -- 'ai' or 'overlay'
  
  -- Approval
  status text DEFAULT 'draft', -- draft, simulated, shared, approved, rejected
  approved_by text,
  approved_at timestamptz,
  patient_feedback text,
  
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_smile_sim_patient ON public.smile_simulations(patient_id);
CREATE INDEX idx_smile_sim_created ON public.smile_simulations(created_at DESC);

ALTER TABLE public.smile_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view smile simulations"
ON public.smile_simulations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create smile simulations"
ON public.smile_simulations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update smile simulations"
ON public.smile_simulations FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete smile simulations"
ON public.smile_simulations FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_smile_simulations_updated_at
BEFORE UPDATE ON public.smile_simulations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();