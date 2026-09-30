
CREATE INDEX IF NOT EXISTS idx_patient_checkins_patient_id ON public.patient_checkins(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_checkins_checkin_time ON public.patient_checkins(checkin_time DESC);
CREATE INDEX IF NOT EXISTS idx_patient_checkins_status ON public.patient_checkins(status);
CREATE INDEX IF NOT EXISTS idx_patient_checkins_patient_time ON public.patient_checkins(patient_id, checkin_time DESC);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient_id ON public.treatment_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_checkin_id ON public.treatment_plans(checkin_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_plan_id ON public.treatment_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plan_items_status ON public.treatment_plan_items(status);

CREATE INDEX IF NOT EXISTS idx_billings_patient_id ON public.billings(patient_id);
CREATE INDEX IF NOT EXISTS idx_billings_checkin_id ON public.billings(checkin_id);
CREATE INDEX IF NOT EXISTS idx_billings_payment_status ON public.billings(payment_status);
CREATE INDEX IF NOT EXISTS idx_billings_created_at ON public.billings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_items_billing_id ON public.billing_items(billing_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_checkin_id ON public.prescriptions(checkin_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_prescription_id ON public.prescription_items(prescription_id);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_id ON public.lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_checkin_id ON public.lab_orders(checkin_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON public.lab_orders(status);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_status ON public.appointments(appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_clinical_photos_patient_id ON public.clinical_photos(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_photos_checkin_id ON public.clinical_photos(checkin_id);

CREATE INDEX IF NOT EXISTS idx_dental_charts_patient_id ON public.dental_charts(patient_id);
CREATE INDEX IF NOT EXISTS idx_dental_charts_checkin_id ON public.dental_charts(checkin_id);
CREATE INDEX IF NOT EXISTS idx_dental_chart_entries_chart_id ON public.dental_chart_entries(chart_id);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_patient_id ON public.patient_vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_vitals_checkin_id ON public.patient_vitals(checkin_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_status ON public.inventory_items(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

ANALYZE public.patient_checkins;
ANALYZE public.treatment_plans;
ANALYZE public.treatment_plan_items;
ANALYZE public.billings;
ANALYZE public.billing_items;
ANALYZE public.lab_orders;
ANALYZE public.appointments;
ANALYZE public.prescriptions;
ANALYZE public.clinical_photos;
ANALYZE public.dental_charts;
