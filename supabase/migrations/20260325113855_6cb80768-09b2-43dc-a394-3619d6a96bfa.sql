
-- Create waste_agencies table for storing collection agency names
CREATE TABLE public.waste_agencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waste_agencies ENABLE ROW LEVEL SECURITY;

-- Public access policy
CREATE POLICY "Public access to waste_agencies" ON public.waste_agencies FOR ALL USING (true) WITH CHECK (true);

-- Add collected_by_person column to waste_logs
ALTER TABLE public.waste_logs ADD COLUMN collected_by_person TEXT;
