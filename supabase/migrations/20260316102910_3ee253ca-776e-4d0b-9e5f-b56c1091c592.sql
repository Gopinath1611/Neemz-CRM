
-- Prescription Templates table
CREATE TABLE public.prescription_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  treatment_category TEXT NOT NULL DEFAULT '',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Prescription Template Items table
CREATE TABLE public.prescription_template_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.prescription_templates(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT DEFAULT '',
  morning TEXT DEFAULT '0',
  afternoon TEXT DEFAULT '0',
  evening TEXT DEFAULT '0',
  night TEXT DEFAULT '0',
  duration TEXT DEFAULT '',
  instructions TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.prescription_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to prescription_templates" ON public.prescription_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to prescription_template_items" ON public.prescription_template_items FOR ALL USING (true) WITH CHECK (true);
