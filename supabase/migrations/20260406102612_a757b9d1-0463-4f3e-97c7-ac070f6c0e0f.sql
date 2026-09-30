
CREATE TABLE public.supplier_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'dental_material',
  brand TEXT,
  unit TEXT DEFAULT 'pcs',
  quantity INTEGER DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to supplier_items" ON public.supplier_items FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_supplier_items_updated_at
  BEFORE UPDATE ON public.supplier_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
