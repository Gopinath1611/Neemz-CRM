-- Job Openings
CREATE TABLE public.job_openings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text NOT NULL DEFAULT 'general',
  designation text,
  job_type text NOT NULL DEFAULT 'full_time',
  experience_min numeric DEFAULT 0,
  experience_max numeric,
  salary_min numeric,
  salary_max numeric,
  location text,
  openings_count integer NOT NULL DEFAULT 1,
  filled_count integer NOT NULL DEFAULT 0,
  hiring_source text NOT NULL DEFAULT 'naukri',
  status text NOT NULL DEFAULT 'open',
  description text,
  requirements text,
  posted_date date DEFAULT CURRENT_DATE,
  closing_date date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recruitment_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_opening_id uuid REFERENCES public.job_openings(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text NOT NULL,
  current_company text,
  current_designation text,
  experience_years numeric DEFAULT 0,
  current_ctc numeric,
  expected_ctc numeric,
  notice_period_days integer,
  location text,
  skills text,
  source text NOT NULL DEFAULT 'naukri',
  source_details text,
  resume_url text,
  current_stage text NOT NULL DEFAULT 'applied',
  status text NOT NULL DEFAULT 'in_progress',
  rating integer,
  date_of_joining date,
  offer_amount numeric,
  rejection_reason text,
  notes text,
  assigned_to uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.recruitment_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.recruitment_candidates(id) ON DELETE CASCADE,
  stage text NOT NULL,
  activity_type text NOT NULL DEFAULT 'note',
  outcome text,
  score numeric,
  scheduled_at timestamptz,
  conducted_by uuid REFERENCES auth.users(id),
  conducted_by_name text,
  feedback text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_candidates_job ON public.recruitment_candidates(job_opening_id);
CREATE INDEX idx_candidates_stage ON public.recruitment_candidates(current_stage);
CREATE INDEX idx_candidates_status ON public.recruitment_candidates(status);
CREATE INDEX idx_activities_candidate ON public.recruitment_activities(candidate_id);

CREATE TRIGGER trg_job_openings_updated BEFORE UPDATE ON public.job_openings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.recruitment_candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin or HR manage job_openings"
  ON public.job_openings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "Admin or HR manage candidates"
  ON public.recruitment_candidates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

CREATE POLICY "Admin or HR manage activities"
  ON public.recruitment_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr'));

INSERT INTO storage.buckets (id, name, public) VALUES ('recruitment-files', 'recruitment-files', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin or HR view resumes"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recruitment-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));

CREATE POLICY "Admin or HR upload resumes"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recruitment-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));

CREATE POLICY "Admin or HR update resumes"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'recruitment-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));

CREATE POLICY "Admin or HR delete resumes"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recruitment-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr')));