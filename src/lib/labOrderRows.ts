// Shared row builder for lab_orders inserts.
// Used by both Clinic Workflow (handleSaveLabOrders) and the
// Lab Orders page "Add Lab Order (Backfill)" form so both entry
// points create identical rows.
export interface LabOrderRowInput {
  patient_id: string;
  checkin_id?: string | null;
  lab_name: string;
  lab_phone?: string | null;
  work_type: string;
  material?: string | null;
  shade?: string | null;
  tooth_number?: string | null;
  description?: string | null;
  price_of_material?: number | string;
  lab_expense?: number | string;
  patient_bill?: number | string;
  lab_expense_paid_amount?: number | string;
  sent_date?: string | null;
  expected_delivery_date?: string | null;
  notes?: string | null;
  doctor?: string | null;
  created_at?: string;
  status?: string;
  actual_delivery_date?: string | null;
  billing_id?: string | null;
  lab_expense_paid_date?: string | null;
  lab_payment_status?: string;
}

export const buildLabOrderRow = (input: LabOrderRowInput) => {
  const toothNumber = input.tooth_number?.toString().trim() || null;
  const row: Record<string, any> = {
    patient_id: input.patient_id,
    checkin_id: input.checkin_id ?? null,
    lab_name: input.lab_name,
    lab_phone: input.lab_phone || null,
    work_type: input.work_type,
    material: input.material || null,
    shade: input.shade || null,
    tooth_number: toothNumber,
    description: toothNumber ? `Teeth: ${toothNumber}` : input.description || null,
    price_of_material: Number(input.price_of_material) || 0,
    lab_expense: Number(input.lab_expense) || 0,
    patient_bill: Number(input.patient_bill) || 0,
    lab_expense_paid_amount: Number(input.lab_expense_paid_amount) || 0,
    sent_date: input.sent_date || null,
    expected_delivery_date: input.expected_delivery_date || null,
    notes: input.notes || null,
    doctor: input.doctor || null,
  };
  if (input.created_at) row.created_at = input.created_at;
  if (input.status) row.status = input.status;
  if (input.actual_delivery_date) row.actual_delivery_date = input.actual_delivery_date;
  if (input.billing_id) row.billing_id = input.billing_id;
  if (input.lab_expense_paid_date) row.lab_expense_paid_date = input.lab_expense_paid_date;
  if (input.lab_payment_status) row.lab_payment_status = input.lab_payment_status;
  return row;
};
