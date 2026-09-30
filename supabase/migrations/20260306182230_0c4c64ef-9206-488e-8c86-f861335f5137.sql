
-- Leads table for patient acquisition engine
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  age INTEGER,
  email TEXT,
  dental_problem TEXT,
  treatment_interest TEXT NOT NULL DEFAULT 'Consultation',
  source TEXT NOT NULL DEFAULT 'walk-in',
  status TEXT NOT NULL DEFAULT 'new_lead',
  lead_score INTEGER NOT NULL DEFAULT 0,
  estimated_value NUMERIC DEFAULT 0,
  notes TEXT,
  ai_priority TEXT DEFAULT 'medium',
  follow_up_date TIMESTAMPTZ,
  assigned_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to leads" ON public.leads FOR ALL USING (true) WITH CHECK (true);

-- Review requests tracking
CREATE TABLE public.review_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  phone TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_received BOOLEAN NOT NULL DEFAULT false,
  rating INTEGER,
  review_text TEXT,
  review_platform TEXT DEFAULT 'google',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to review_requests" ON public.review_requests FOR ALL USING (true) WITH CHECK (true);

-- Referrals tracking
CREATE TABLE public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  referrer_name TEXT NOT NULL,
  referrer_phone TEXT,
  referred_name TEXT NOT NULL,
  referred_phone TEXT NOT NULL,
  referral_code TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_type TEXT,
  reward_given BOOLEAN NOT NULL DEFAULT false,
  treatment_booked TEXT,
  revenue_generated NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to referrals" ON public.referrals FOR ALL USING (true) WITH CHECK (true);

-- Content calendar for social media
CREATE TABLE public.content_calendar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'post',
  platform TEXT NOT NULL DEFAULT 'instagram',
  scheduled_date DATE,
  scheduled_time TIME,
  caption TEXT,
  hashtags TEXT,
  hook TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  engagement_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to content_calendar" ON public.content_calendar FOR ALL USING (true) WITH CHECK (true);

-- WhatsApp campaigns
CREATE TABLE public.whatsapp_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'promotion',
  target_segment TEXT,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  response_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to whatsapp_campaigns" ON public.whatsapp_campaigns FOR ALL USING (true) WITH CHECK (true);

-- Patient recalls
CREATE TABLE public.patient_recalls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  phone TEXT,
  recall_type TEXT NOT NULL,
  recall_date DATE NOT NULL,
  last_visit_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_recalls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to patient_recalls" ON public.patient_recalls FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
