
-- Sterilization logs
CREATE TABLE public.sterilization_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_name TEXT NOT NULL,
  sterilization_method TEXT NOT NULL DEFAULT 'autoclave', -- autoclave, chemical, dry_heat, uv
  cycle_number INTEGER DEFAULT 1,
  performed_by TEXT NOT NULL, -- assistant name
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_minutes INTEGER DEFAULT 30,
  temperature TEXT, -- e.g. "134°C"
  pressure TEXT, -- e.g. "30 PSI"
  result TEXT NOT NULL DEFAULT 'pass', -- pass, fail
  batch_id TEXT, -- group instruments in same cycle
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Waste management logs
CREATE TABLE public.waste_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  waste_type TEXT NOT NULL DEFAULT 'biomedical', -- biomedical, sharps, general, chemical, pharmaceutical
  waste_category TEXT NOT NULL DEFAULT 'yellow', -- yellow, red, white, blue, black (color coded bags)
  items_description TEXT NOT NULL, -- e.g. "Used gloves, cotton, gauze"
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'kg', -- kg, pieces, bags
  collected_by TEXT, -- waste collection agency/person
  collection_date DATE NOT NULL DEFAULT CURRENT_DATE,
  collection_time TIME WITHOUT TIME ZONE,
  disposed_by TEXT, -- staff who handed over
  manifest_number TEXT, -- waste manifest/tracking number
  is_collected BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.sterilization_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to sterilization_logs" ON public.sterilization_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to waste_logs" ON public.waste_logs FOR ALL USING (true) WITH CHECK (true);
