DELETE FROM public.expense_categories
WHERE value NOT IN (
  'staff_expenses','clinical_consumables','lab_charges','equipment_expenses',
  'rent_utilities','marketing_expenses','admin_expenses','finance_costs',
  'compliance_professional','expansion_expenses'
);