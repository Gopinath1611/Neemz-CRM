
-- Doctors table
CREATE TABLE public.doctors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT,
  whatsapp TEXT,
  specialization TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to doctors" ON public.doctors FOR ALL TO public USING (true) WITH CHECK (true);

-- Clinic Treatments table
CREATE TABLE public.clinic_treatments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  charge NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to clinic_treatments" ON public.clinic_treatments FOR ALL TO public USING (true) WITH CHECK (true);

-- Medicines table
CREATE TABLE public.medicines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'tablet',
  before_food BOOLEAN DEFAULT false,
  after_food BOOLEAN DEFAULT true,
  morning BOOLEAN DEFAULT false,
  afternoon BOOLEAN DEFAULT false,
  evening BOOLEAN DEFAULT false,
  night BOOLEAN DEFAULT false,
  days INTEGER DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to medicines" ON public.medicines FOR ALL TO public USING (true) WITH CHECK (true);

-- Labs table
CREATE TABLE public.labs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  mobile TEXT,
  whatsapp TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to labs" ON public.labs FOR ALL TO public USING (true) WITH CHECK (true);

-- Lab Works table
CREATE TABLE public.lab_works (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  materials TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.lab_works ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to lab_works" ON public.lab_works FOR ALL TO public USING (true) WITH CHECK (true);
