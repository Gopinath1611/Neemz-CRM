
-- Education Categories
CREATE TABLE public.education_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ta text,
  icon text DEFAULT '🦷',
  color text DEFAULT 'bg-blue-500/10 text-blue-600 border-blue-200',
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Education Subcategories
CREATE TABLE public.education_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.education_categories(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  name_ta text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Education Videos
CREATE TABLE public.education_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id uuid REFERENCES public.education_subcategories(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  youtube_url text,
  thumbnail_url text,
  type text NOT NULL DEFAULT 'video',
  is_custom boolean DEFAULT false,
  treatment_keywords text[] DEFAULT '{}',
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.education_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to education_categories" ON public.education_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to education_subcategories" ON public.education_subcategories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to education_videos" ON public.education_videos FOR ALL USING (true) WITH CHECK (true);

-- Seed Categories
INSERT INTO public.education_categories (id, name, name_ta, icon, color, sort_order) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Scaling & Cleaning', 'ஸ்கேலிங் & கிளீனிங்', '🦷', 'bg-blue-500/10 text-blue-600 border-blue-200', 1),
  ('a1000000-0000-0000-0000-000000000002', 'Teeth Whitening', 'டீத் வைட்டனிங்', '✨', 'bg-yellow-500/10 text-yellow-600 border-yellow-200', 2),
  ('a1000000-0000-0000-0000-000000000003', 'Dental Implants', 'டென்டல் இம்ப்ளான்ட்', '🔩', 'bg-purple-500/10 text-purple-600 border-purple-200', 3),
  ('a1000000-0000-0000-0000-000000000004', 'Braces & Orthodontics', 'பிரேசஸ் & ஆர்த்தோடான்டிக்ஸ்', '😁', 'bg-green-500/10 text-green-600 border-green-200', 4),
  ('a1000000-0000-0000-0000-000000000005', 'Root Canal Treatment', 'ரூட் கேனல் சிகிச்சை', '🏥', 'bg-red-500/10 text-red-600 border-red-200', 5),
  ('a1000000-0000-0000-0000-000000000006', 'Dental Crowns & Bridges', 'டென்டல் கிரவுன் & பிரிட்ஜ்', '👑', 'bg-amber-500/10 text-amber-600 border-amber-200', 6),
  ('a1000000-0000-0000-0000-000000000007', 'Tooth Extraction', 'பல் எடுத்தல்', '🔧', 'bg-slate-500/10 text-slate-600 border-slate-200', 7),
  ('a1000000-0000-0000-0000-000000000008', 'Dentures', 'டென்ச்சர்ஸ்', '🦷', 'bg-teal-500/10 text-teal-600 border-teal-200', 8);

-- Seed Subcategories
INSERT INTO public.education_subcategories (id, category_id, name, name_ta, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Ultrasonic Scaling', 'அல்ட்ராசோனிக் ஸ்கேலிங்', 1),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Deep Cleaning (SRP)', 'டீப் கிளீனிங்', 2),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'In-Office Whitening', 'இன்-ஆபிஸ் வைட்டனிங்', 1),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'Home Whitening Kit', 'ஹோம் வைட்டனிங் கிட்', 2),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000003', 'Single Tooth Implant', 'சிங்கிள் டூத் இம்ப்ளான்ட்', 1),
  ('b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'All-on-4 Implants', 'ஆல்-ஆன்-4 இம்ப்ளான்ட்', 2),
  ('b1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000003', 'Implant Crown', 'இம்ப்ளான்ட் கிரவுன்', 3),
  ('b1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000004', 'Metal Braces', 'மெட்டல் பிரேசஸ்', 1),
  ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000004', 'Ceramic Braces', 'செராமிக் பிரேசஸ்', 2),
  ('b1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000004', 'Zirconia Braces', 'ஜிர்கோனியா பிரேசஸ்', 3),
  ('b1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000004', 'Clear Aligners', 'கிளியர் அலைனர்ஸ்', 4),
  ('b1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000005', 'RCT + Metal Crown', 'RCT + மெட்டல் கிரவுன்', 1),
  ('b1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000005', 'RCT + Ceramic Crown', 'RCT + செராமிக் கிரவுன்', 2),
  ('b1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000005', 'RCT + Zirconia Crown', 'RCT + ஜிர்கோனியா கிரவுன்', 3),
  ('b1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000006', 'PFM Crown', 'PFM கிரவுன்', 1),
  ('b1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000006', 'Zirconia Crown', 'ஜிர்கோனியா கிரவுன்', 2),
  ('b1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000006', 'E-max Crown', 'E-max கிரவுன்', 3),
  ('b1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000006', 'Dental Bridge', 'டென்டல் பிரிட்ஜ்', 4),
  ('b1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000007', 'Simple Extraction', 'சிம்பிள் எக்ஸ்ட்ராக்ஷன்', 1),
  ('b1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000007', 'Wisdom Tooth Removal', 'விஸ்டம் டூத் ரிமூவல்', 2),
  ('b1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000008', 'Complete Denture', 'கம்ப்ளீட் டென்ச்சர்', 1),
  ('b1000000-0000-0000-0000-000000000022', 'a1000000-0000-0000-0000-000000000008', 'Partial Denture', 'பார்ஷியல் டென்ச்சர்', 2);

-- Seed Videos with treatment_keywords for matching
INSERT INTO public.education_videos (subcategory_id, title, description, youtube_url, type, treatment_keywords, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'What is Dental Scaling?', 'Understanding the scaling procedure, why it''s needed, and what to expect during treatment.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['scaling', 'cleaning', 'ultrasonic scaling'], 1),
  ('b1000000-0000-0000-0000-000000000002', 'Deep Cleaning Explained', 'Root planing and scaling for gum disease treatment.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['deep cleaning', 'srp', 'root planing'], 1),
  ('b1000000-0000-0000-0000-000000000003', 'Professional Teeth Whitening', 'How in-office whitening works and the amazing results you can expect.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['whitening', 'bleaching', 'teeth whitening'], 1),
  ('b1000000-0000-0000-0000-000000000004', 'Home Whitening Guide', 'Step-by-step guide to using home whitening trays safely.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['home whitening', 'whitening kit'], 1),
  ('b1000000-0000-0000-0000-000000000005', 'Single Implant Procedure', 'Complete walkthrough of single tooth implant placement and healing.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['implant', 'dental implant', 'single implant'], 1),
  ('b1000000-0000-0000-0000-000000000006', 'All-on-4 Full Arch', 'Full arch restoration with just 4 implants.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['all-on-4', 'all on 4', 'full arch implant'], 1),
  ('b1000000-0000-0000-0000-000000000007', 'Implant Crown Placement', 'How the final crown is attached to the implant.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['implant crown'], 1),
  ('b1000000-0000-0000-0000-000000000008', 'Metal Braces Treatment', 'Traditional metal braces - how they work and treatment timeline.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['metal braces', 'braces', 'orthodontics'], 1),
  ('b1000000-0000-0000-0000-000000000009', 'Ceramic Braces Overview', 'Tooth-colored brackets for a more aesthetic appearance.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['ceramic braces'], 1),
  ('b1000000-0000-0000-0000-000000000010', 'Zirconia Braces Benefits', 'Premium zirconia brackets - strongest and most aesthetic option.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['zirconia braces'], 1),
  ('b1000000-0000-0000-0000-000000000011', 'Clear Aligners Journey', 'Invisible aligners for discreet teeth straightening.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['clear aligners', 'aligners', 'invisible braces'], 1),
  ('b1000000-0000-0000-0000-000000000012', 'Root Canal with Metal Crown', 'Complete RCT procedure followed by durable metal crown restoration.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['rct', 'root canal', 'rct metal crown'], 1),
  ('b1000000-0000-0000-0000-000000000013', 'Root Canal with Ceramic Crown', 'RCT with natural-looking ceramic crown for front teeth.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['rct ceramic', 'root canal ceramic'], 1),
  ('b1000000-0000-0000-0000-000000000014', 'Root Canal with Zirconia Crown', 'Premium RCT with strongest and most aesthetic zirconia crown.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['rct zirconia', 'root canal zirconia'], 1),
  ('b1000000-0000-0000-0000-000000000015', 'PFM Crown Explained', 'Porcelain fused to metal crown - affordable and durable option.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['pfm crown', 'pfm', 'porcelain crown'], 1),
  ('b1000000-0000-0000-0000-000000000016', 'Zirconia Crown Benefits', 'Premium metal-free crown with superior aesthetics and strength.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['zirconia crown', 'zirconia', 'crown'], 1),
  ('b1000000-0000-0000-0000-000000000017', 'E-max Crown - Best Aesthetics', 'Lithium disilicate crown for the most natural appearance.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['e-max', 'emax', 'e-max crown'], 1),
  ('b1000000-0000-0000-0000-000000000018', 'Dental Bridge Procedure', 'Replace missing teeth with a fixed bridge restoration.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['bridge', 'dental bridge', 'fixed bridge'], 1),
  ('b1000000-0000-0000-0000-000000000019', 'Simple Tooth Extraction', 'What to expect during a routine tooth extraction.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['extraction', 'tooth extraction', 'simple extraction'], 1),
  ('b1000000-0000-0000-0000-000000000020', 'Wisdom Tooth Surgery', 'Surgical removal of impacted wisdom teeth explained.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['wisdom tooth', 'wisdom extraction', 'impacted tooth'], 1),
  ('b1000000-0000-0000-0000-000000000021', 'Complete Denture Process', 'Full denture fabrication from impression to fitting.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['complete denture', 'denture', 'full denture'], 1),
  ('b1000000-0000-0000-0000-000000000022', 'Partial Denture Options', 'Replacing a few missing teeth with removable partial denture.', 'https://www.youtube.com/embed/ygMwMGcHFaQ', 'video', ARRAY['partial denture', 'rpd'], 1);

-- Add image entries
INSERT INTO public.education_videos (subcategory_id, title, description, thumbnail_url, type, treatment_keywords, sort_order) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Before & After Scaling', 'Visual comparison showing the dramatic difference scaling makes for dental health.', 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=400', 'image', ARRAY['scaling'], 2);
