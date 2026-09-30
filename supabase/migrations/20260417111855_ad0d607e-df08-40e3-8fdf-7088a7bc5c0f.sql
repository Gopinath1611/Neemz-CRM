-- Ensure unique constraint on expense_categories.value
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_value_key UNIQUE (value);

-- Add subcategory column to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS subcategory text;

-- Create expense_subcategories table
CREATE TABLE IF NOT EXISTS public.expense_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_value text NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(category_value, value)
);

ALTER TABLE public.expense_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access to expense_subcategories"
ON public.expense_subcategories FOR ALL
USING (true) WITH CHECK (true);

-- Seed default categories
INSERT INTO public.expense_categories (name, value, is_default, is_active) VALUES
  ('Staff Expenses', 'staff_expenses', true, true),
  ('Clinical Consumables', 'clinical_consumables', true, true),
  ('Lab Charges', 'lab_charges', true, true),
  ('Equipment Expenses', 'equipment_expenses', true, true),
  ('Rent & Utilities', 'rent_utilities', true, true),
  ('Marketing Expenses', 'marketing_expenses', true, true),
  ('Admin Expenses', 'admin_expenses', true, true),
  ('Finance Costs', 'finance_costs', true, true),
  ('Compliance & Professional Fees', 'compliance_professional', true, true),
  ('Expansion Expenses', 'expansion_expenses', true, true)
ON CONFLICT (value) DO UPDATE SET name = EXCLUDED.name, is_default = true, is_active = true;

INSERT INTO public.expense_subcategories (category_value, name, value, is_default) VALUES
  ('staff_expenses', 'Salaries', 'salaries', true),
  ('staff_expenses', 'Incentives & Bonuses', 'incentives_bonuses', true),
  ('staff_expenses', 'PF / ESI Contributions', 'pf_esi', true),
  ('staff_expenses', 'Training Costs', 'training_costs', true),
  ('staff_expenses', 'Uniforms', 'uniforms', true),
  ('clinical_consumables', 'Gloves, Masks, Disposables', 'gloves_masks', true),
  ('clinical_consumables', 'Impression Materials', 'impression_materials', true),
  ('clinical_consumables', 'Composite, Cement', 'composite_cement', true),
  ('clinical_consumables', 'Endo Files', 'endo_files', true),
  ('clinical_consumables', 'Sterilization Materials', 'sterilization_materials', true),
  ('lab_charges', 'Crown & Bridge Lab Fees', 'crown_bridge', true),
  ('lab_charges', 'Aligners', 'aligners', true),
  ('lab_charges', 'Dentures', 'dentures', true),
  ('lab_charges', 'Implant Prosthetics', 'implant_prosthetics', true),
  ('equipment_expenses', 'New Equipment Purchase', 'new_equipment', true),
  ('equipment_expenses', 'AMC (Annual Maintenance)', 'amc', true),
  ('equipment_expenses', 'Repairs & Servicing', 'repairs_servicing', true),
  ('equipment_expenses', 'Depreciation Tracking', 'depreciation', true),
  ('rent_utilities', 'Clinic Rent', 'clinic_rent', true),
  ('rent_utilities', 'Electricity', 'electricity', true),
  ('rent_utilities', 'Water', 'water', true),
  ('rent_utilities', 'Internet', 'internet', true),
  ('rent_utilities', 'Generator Fuel', 'generator_fuel', true),
  ('marketing_expenses', 'Meta / Google Ads', 'meta_google_ads', true),
  ('marketing_expenses', 'Offline Posters & Banners', 'offline_posters', true),
  ('marketing_expenses', 'Camp Expenses', 'camp_expenses', true),
  ('marketing_expenses', 'Referral Payouts', 'referral_payouts', true),
  ('marketing_expenses', 'Website Maintenance', 'website_maintenance', true),
  ('admin_expenses', 'Software Subscriptions', 'software_subscriptions', true),
  ('admin_expenses', 'Printing & Stationery', 'printing_stationery', true),
  ('admin_expenses', 'Courier', 'courier', true),
  ('admin_expenses', 'Office Supplies', 'office_supplies', true),
  ('finance_costs', 'Loan EMI', 'loan_emi', true),
  ('finance_costs', 'Interest Payments', 'interest_payments', true),
  ('finance_costs', 'Bank Charges', 'bank_charges', true),
  ('finance_costs', 'POS Machine Fees', 'pos_fees', true),
  ('compliance_professional', 'CA Fees', 'ca_fees', true),
  ('compliance_professional', 'Legal Fees', 'legal_fees', true),
  ('compliance_professional', 'ROC Filings', 'roc_filings', true),
  ('compliance_professional', 'GST Filing Charges', 'gst_filing', true),
  ('expansion_expenses', 'New Branch Interiors', 'branch_interiors', true),
  ('expansion_expenses', 'Chair Purchase', 'chair_purchase', true),
  ('expansion_expenses', 'Branding Boards', 'branding_boards', true),
  ('expansion_expenses', 'Recruitment Costs', 'recruitment_costs', true),
  ('expansion_expenses', 'Launch Events', 'launch_events', true)
ON CONFLICT (category_value, value) DO NOTHING;