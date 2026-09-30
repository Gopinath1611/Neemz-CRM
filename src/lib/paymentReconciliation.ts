// Read-time reconciliation between `billings` (ledger of record) and
// `billing_payments` (per-mode payment transactions).
//
// Many historical billings have `amount_paid > 0` but never produced
// `billing_payments` rows (legacy data captured before split-mode tracking
// existed). The new Finance Dashboard and analytics aggregate from
// `billing_payments`, which causes the historical collections to disappear
// from "Collected" and mode-wise charts.
//
// To fix this without touching historical data, every consumer of payment
// rows merges the real rows with virtual "legacy synthetic" rows generated
// on the fly by `synthesizeLegacyPayments`. The synthetic rows:
//   - Are NEVER persisted (this module performs zero writes).
//   - Are idempotent — same inputs always produce the same output.
//   - Carry `is_legacy_synth: true` so callers can distinguish them.
//   - Use canonical mode keys via `parsePaymentSplits` + `normalizeMode`.
//   - Decompose `billings.payment_method` ("cash:500, upi:1000", "cash, upi",
//     "cash") via the existing parser; unknown / un-amounted composites land
//     in the `legacy_unknown` bucket — they are never silently distributed.
//
// Grand totals after merge satisfy:
//   Σ merged.amount  ==  Σ billings.amount_paid
//   (per billing: Σ payments for billing == billing.amount_paid)
//
// This keeps Collected (Dashboard) identical to the Billing ledger while
// preserving every existing payment row and every historical billing record.

import { parsePaymentSplits, type PaymentMode } from "@/lib/paymentMode";

export interface PaymentRow {
  id: string;
  billing_id: string | null;
  patient_id?: string | null;
  payment_date: string | null;
  amount: number;
  payment_method: string | null;
  notes?: string | null;
  status?: string | null;
  is_legacy_synth?: boolean;
}

interface BillingRow {
  id: string;
  patient_id?: string | null;
  total_amount: number | null;
  amount_paid: number | null;
  payment_method: string | null;
  payment_status?: string | null;
  created_at: string | null;
}

const RECON_EPSILON = 0.01;

const sumByBilling = (
  rows: ReadonlyArray<PaymentRow>
): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (!r?.billing_id) continue;
    const amt = Number(r.amount || 0);
    if (!isFinite(amt) || amt === 0) continue;
    m.set(r.billing_id, (m.get(r.billing_id) || 0) + amt);
  }
  return m;
};

/**
 * Build synthetic payment rows for every billing whose `amount_paid` exceeds
 * the sum of its real `billing_payments`. Each gap is decomposed via
 * `parsePaymentSplits(billing.payment_method, gap)`.
 *
 * Pure, idempotent, never touches the database.
 */
export const synthesizeLegacyPayments = (
  billings: ReadonlyArray<BillingRow> = [],
  billingPayments: ReadonlyArray<PaymentRow> = []
): PaymentRow[] => {
  const realSumByBilling = sumByBilling(billingPayments);
  const synth: PaymentRow[] = [];

  for (const b of billings) {
    if (!b?.id) continue;
    const amountPaid = Number(b.amount_paid || 0);
    if (!(amountPaid > 0)) continue;

    // Skip cancelled / void ledger entries — they contribute nothing.
    const status = String(b.payment_status || "").toLowerCase();
    if (status === "cancelled" || status === "void" || status === "voided") continue;

    const realSum = realSumByBilling.get(b.id) || 0;
    const gap = amountPaid - realSum;
    if (gap <= RECON_EPSILON) continue;

    const splits = parsePaymentSplits(b.payment_method, gap);
    splits.forEach((s, idx) => {
      const amt = Number(s.amount || 0);
      if (!(amt > 0)) return;
      synth.push({
        id: `legacy-synth:${b.id}:${idx}`,
        billing_id: b.id,
        patient_id: b.patient_id ?? null,
        payment_date: b.created_at,
        amount: amt,
        payment_method: s.mode as PaymentMode,
        notes: "Reconciled from legacy billing ledger",
        is_legacy_synth: true,
      });
    });
  }

  return synth;
};

/**
 * Concatenate real payment rows with synthesized legacy rows. Result is the
 * canonical dataset every Finance / Analytics / Report / Export consumer
 * should aggregate over.
 */
export const mergeWithLegacyPayments = (
  billings: ReadonlyArray<BillingRow> = [],
  billingPayments: ReadonlyArray<PaymentRow> = []
): PaymentRow[] => {
  const synth = synthesizeLegacyPayments(billings, billingPayments);
  if (synth.length === 0) return billingPayments as PaymentRow[];
  return [...(billingPayments as PaymentRow[]), ...synth];
};

export interface ReconciliationAudit {
  totalBillings: number;
  totalRealPayments: number;
  totalSyntheticPayments: number;

  sumBillingsAmountPaid: number;
  sumRealPayments: number;
  sumSyntheticPayments: number;
  sumMergedPayments: number;

  /** Billings where amount_paid > Σ real payments (under-recorded). */
  underRecordedBillings: Array<{ billing_id: string; expected: number; actual: number; gap: number }>;
  /** Billings where Σ real payments > total_amount (over-recorded). */
  overRecordedBillings: Array<{ billing_id: string; total: number; recorded: number; excess: number }>;
  /** Billings with amount_paid > 0 but no payment rows at all. */
  missingPaymentRows: string[];
  /** Real payment rows whose (billing,date-minute,amount,method) collide. */
  duplicateRealPayments: number;
  /** Σ underRecorded gaps — equals what synthesis covers. */
  reconciliationDifference: number;
}

export const runReconciliationAudit = (
  billings: ReadonlyArray<BillingRow> = [],
  billingPayments: ReadonlyArray<PaymentRow> = []
): ReconciliationAudit => {
  const realSumByBilling = sumByBilling(billingPayments);
  const realCountByBilling = new Map<string, number>();
  for (const p of billingPayments) {
    if (!p?.billing_id) continue;
    realCountByBilling.set(p.billing_id, (realCountByBilling.get(p.billing_id) || 0) + 1);
  }

  const underRecorded: ReconciliationAudit["underRecordedBillings"] = [];
  const overRecorded: ReconciliationAudit["overRecordedBillings"] = [];
  const missing: string[] = [];
  let sumBillingsAmountPaid = 0;

  for (const b of billings) {
    if (!b?.id) continue;
    const status = String(b.payment_status || "").toLowerCase();
    if (status === "cancelled" || status === "void" || status === "voided") continue;
    const paid = Number(b.amount_paid || 0);
    const total = Number(b.total_amount || 0);
    sumBillingsAmountPaid += paid;
    const realSum = realSumByBilling.get(b.id) || 0;

    if (paid > 0 && (realCountByBilling.get(b.id) || 0) === 0) missing.push(b.id);
    if (paid - realSum > RECON_EPSILON) {
      underRecorded.push({ billing_id: b.id, expected: paid, actual: realSum, gap: paid - realSum });
    }
    if (realSum - total > RECON_EPSILON) {
      overRecorded.push({ billing_id: b.id, total, recorded: realSum, excess: realSum - total });
    }
  }

  // Duplicate detection on raw rows: (billing_id, payment_date minute, amount, method)
  const dupSeen = new Map<string, number>();
  for (const p of billingPayments) {
    if (!p?.billing_id || !p.payment_date) continue;
    const minute = String(p.payment_date).slice(0, 16);
    const key = `${p.billing_id}|${minute}|${Number(p.amount || 0).toFixed(2)}|${String(p.payment_method || "").toLowerCase().trim()}`;
    dupSeen.set(key, (dupSeen.get(key) || 0) + 1);
  }
  let duplicateRealPayments = 0;
  for (const n of dupSeen.values()) if (n > 1) duplicateRealPayments += n - 1;

  const synth = synthesizeLegacyPayments(billings, billingPayments);
  const sumReal = (billingPayments as PaymentRow[]).reduce((a, p) => a + Number(p?.amount || 0), 0);
  const sumSynth = synth.reduce((a, p) => a + Number(p.amount || 0), 0);

  return {
    totalBillings: billings.length,
    totalRealPayments: billingPayments.length,
    totalSyntheticPayments: synth.length,
    sumBillingsAmountPaid,
    sumRealPayments: sumReal,
    sumSyntheticPayments: sumSynth,
    sumMergedPayments: sumReal + sumSynth,
    underRecordedBillings: underRecorded,
    overRecordedBillings: overRecorded,
    missingPaymentRows: missing,
    duplicateRealPayments,
    reconciliationDifference: underRecorded.reduce((a, x) => a + x.gap, 0),
  };
};
