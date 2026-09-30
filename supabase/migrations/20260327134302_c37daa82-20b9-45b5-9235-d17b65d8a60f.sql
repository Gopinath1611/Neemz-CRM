
-- 1. Institution Master
CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'school',
  address text,
  area text,
  contact_person_name text,
  contact_person_role text DEFAULT 'principal',
  phone text,
  email text,
  decision_maker_level text DEFAULT 'medium',
  last_visit_date date,
  next_followup_date date,
  status text NOT NULL DEFAULT 'not_contacted',
  notes text,
  assigned_coordinator text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to institutions" ON public.institutions FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Campaigns
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'school',
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  campaign_date date,
  objective text DEFAULT 'awareness',
  expected_participants integer DEFAULT 0,
  doctor_assigned text,
  assistant_assigned text,
  coordinator_assigned text,
  approval_status text DEFAULT 'pending',
  campaign_status text NOT NULL DEFAULT 'planned',
  estimated_cost numeric DEFAULT 0,
  actual_cost numeric DEFAULT 0,
  notes text,
  checklist jsonb DEFAULT '{"permission_letter_sent":false,"approval_received":false,"doctor_assigned":false,"assistant_assigned":false,"educational_materials_prepared":false,"screening_forms_ready":false,"coupons_printed":false,"feedback_forms_ready":false,"transport_arranged":false}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to campaigns" ON public.campaigns FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Screening Leads
CREATE TABLE public.screening_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  participant_name text NOT NULL,
  age integer,
  gender text DEFAULT 'male',
  mobile text,
  institution_name text,
  department_class text,
  chief_complaint text,
  screening_findings text,
  recommended_treatment text,
  treatment_tags text[] DEFAULT '{}',
  priority_level text DEFAULT 'normal',
  interested_in_visit boolean DEFAULT false,
  coupon_issued boolean DEFAULT false,
  followup_status text DEFAULT 'pending',
  converted_to_patient boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.screening_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to screening_leads" ON public.screening_leads FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Campaign Coupons
CREATE TABLE public.campaign_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.screening_leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  offer_type text DEFAULT 'free_consultation',
  discount_percentage numeric DEFAULT 0,
  expiry_date date,
  redeemed boolean DEFAULT false,
  redeemed_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to campaign_coupons" ON public.campaign_coupons FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. Campaign Follow-ups
CREATE TABLE public.campaign_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.screening_leads(id) ON DELETE CASCADE NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE NOT NULL,
  followup_type text NOT NULL,
  scheduled_date date NOT NULL,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to campaign_followups" ON public.campaign_followups FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. Corporate Partnerships
CREATE TABLE public.corporate_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  annual_dental_package boolean DEFAULT false,
  employee_coverage_count integer DEFAULT 0,
  visit_frequency text DEFAULT 'quarterly',
  insurance_supported boolean DEFAULT false,
  csr_collaboration boolean DEFAULT false,
  contract_start_date date,
  contract_renewal_date date,
  partner_status text DEFAULT 'prospect',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.corporate_partnerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to corporate_partnerships" ON public.corporate_partnerships FOR ALL TO public USING (true) WITH CHECK (true);
