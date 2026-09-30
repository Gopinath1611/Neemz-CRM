type BillingLike = {
  id: string;
  invoice_number?: string | null;
  amount_paid?: number | null;
  total_amount?: number | null;
  payment_status?: string | null;
  created_at?: string | null;
};

const getBillingPriority = (record: BillingLike) => {
  const isSettled = record.payment_status === "paid" ? 2 : record.payment_status === "partial" ? 1 : 0;
  const hasMoney = Number(record.amount_paid || 0) > 0 || Number(record.total_amount || 0) > 0 ? 1 : 0;
  const createdAtScore = record.created_at ? new Date(record.created_at).getTime() : 0;

  return [hasMoney, isSettled, Number(record.amount_paid || 0), Number(record.total_amount || 0), createdAtScore];
};

const shouldReplaceBilling = (current: BillingLike, next: BillingLike) => {
  const currentPriority = getBillingPriority(current);
  const nextPriority = getBillingPriority(next);

  for (let index = 0; index < currentPriority.length; index += 1) {
    if (nextPriority[index] > currentPriority[index]) return true;
    if (nextPriority[index] < currentPriority[index]) return false;
  }

  return next.id > current.id;
};

export const dedupeBillingRecords = <T extends BillingLike>(records: T[]) => {
  const billingMap = new Map<string, T>();

  records.forEach((record) => {
    const key = record.invoice_number?.trim() || record.id;
    const existing = billingMap.get(key);

    if (!existing || shouldReplaceBilling(existing, record)) {
      billingMap.set(key, record);
    }
  });

  return Array.from(billingMap.values()).sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
};
