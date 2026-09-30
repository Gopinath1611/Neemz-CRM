// Single source of truth for Mode of Payment classification.
//
// - All new payments are written as ONE billing_payments row per mode with a
//   canonical key in `payment_method` (e.g. "cash", "upi", "credit_card").
// - All Finance / Analytics / Report / Export aggregation routes through
//   aggregatePaymentsByMode(), which uses parsePaymentSplits() to also
//   correctly decompose historical composite rows like "cash:500, upi:1240".
// - Legacy rows like "cash, upi" (no amounts) are NEVER artificially split;
//   they're classified as "legacy_unknown" with the full row amount preserved.

export type PaymentMode =
  | "cash"
  | "upi"
  | "credit_card"
  | "debit_card"
  | "card"
  | "bank_transfer"
  | "cheque"
  | "emi"
  | "insurance"
  | "wallet"
  | "legacy_unknown"
  | "adjustment"
  | "other";

export interface PaymentModeOption {
  value: PaymentMode;
  label: string;
}

// Dropdown source used by every Record-Payment surface.
export const PAYMENT_MODE_OPTIONS: PaymentModeOption[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "emi", label: "EMI" },
  { value: "insurance", label: "Insurance" },
  { value: "wallet", label: "Wallet" },
  { value: "other", label: "Other" },
];

// Reporting buckets. credit_card / debit_card fold into `card` for charts;
// `legacy_unknown` is shown so auditors can see historical un-split rows.
export const REPORT_MODES: PaymentMode[] = [
  "cash",
  "upi",
  "card",
  "bank_transfer",
  "cheque",
  "emi",
  "insurance",
  "wallet",
  "legacy_unknown",
  "adjustment",
  "other",
];

const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  emi: "EMI",
  insurance: "Insurance",
  wallet: "Wallet",
  legacy_unknown: "Legacy / Unknown Split",
  adjustment: "Adjustment",
  other: "Other",
};

const MODE_COLORS: Record<string, string> = {
  cash: "hsl(142,71%,45%)",
  upi: "hsl(217,91%,50%)",
  card: "hsl(38,92%,50%)",
  credit_card: "hsl(38,92%,50%)",
  debit_card: "hsl(28,85%,55%)",
  bank_transfer: "hsl(260,60%,55%)",
  cheque: "hsl(190,70%,45%)",
  emi: "hsl(330,80%,55%)",
  insurance: "hsl(20,85%,55%)",
  wallet: "hsl(280,60%,55%)",
  legacy_unknown: "hsl(0,0%,55%)",
  adjustment: "hsl(0,72%,51%)",
  other: "hsl(220,10%,46%)",
};

export const modeLabel = (key: string): string =>
  MODE_LABELS[key] ||
  String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase()) ||
  "Other";

export const modeColor = (key: string): string =>
  MODE_COLORS[key] || "hsl(220,10%,46%)";

// Canonicalize any free-text token into a known PaymentMode.
// Never throws — unknown values fall back to "other".
export const normalizeMode = (raw: string | null | undefined): PaymentMode => {
  const k = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
  if (!k) return "other";
  if (k.includes("adjust")) return "adjustment";
  if (k.includes("upi") || k.includes("gpay") || k.includes("phonepe") || k.includes("paytm")) return "upi";
  if (k.includes("credit")) return "credit_card";
  if (k.includes("debit")) return "debit_card";
  if (k.includes("card")) return "card";
  if (
    k.includes("neft") ||
    k.includes("rtgs") ||
    k.includes("imps") ||
    k.includes("bank") ||
    k.includes("transfer")
  )
    return "bank_transfer";
  if (k.includes("cheque") || k.includes("check") || k === "dd") return "cheque";
  if (k.includes("emi") || k.includes("loan") || k.includes("finance")) return "emi";
  if (k.includes("insurance") || k.includes("claim") || k.includes("tpa")) return "insurance";
  if (k.includes("wallet") || k.includes("paypal")) return "wallet";
  if (k.includes("cash")) return "cash";
  return "other";
};

// Roll credit/debit into "card" for chart buckets. Use modeLabel(originalMode)
// when you want the full granular display.
export const reportBucket = (mode: PaymentMode): PaymentMode => {
  if (mode === "credit_card" || mode === "debit_card") return "card";
  return mode;
};

export interface PaymentSplit {
  mode: PaymentMode;
  amount: number;
}

/**
 * Parse a `billing_payments.payment_method` value into one or more
 * { mode, amount } splits whose amounts sum to `totalAmount`.
 *
 * Supported shapes (all historical formats handled):
 *   "cash"                       → [{cash, total}]
 *   "upi:300"                    → [{upi, 300}]
 *   "cash:500, upi:1240"         → [{cash,500},{upi,1240}]
 *   "cash, upi"                  → [{legacy_unknown, total}]   ← NEVER guess split
 *   "cash, upi:200"              → [{upi,200},{legacy_unknown, total-200}]
 *   ""/null                      → [{other, total}]
 */
export const parsePaymentSplits = (
  rawMethod: string | null | undefined,
  totalAmount: number
): PaymentSplit[] => {
  const total = Number(totalAmount || 0);

  if (!rawMethod || !String(rawMethod).trim()) {
    return [{ mode: "other", amount: total }];
  }

  const tokens = String(rawMethod)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) return [{ mode: "other", amount: total }];

  const parsed = tokens.map((t) => {
    const [m, a] = t.split(":").map((x) => (x ?? "").trim());
    const amt = a !== undefined && a !== "" ? Number(a) : NaN;
    return { mode: normalizeMode(m), amount: isFinite(amt) ? amt : NaN };
  });

  // Single token, no amount → whole row is that mode.
  if (parsed.length === 1) {
    const p = parsed[0];
    return [{ mode: p.mode, amount: isFinite(p.amount) ? p.amount : total }];
  }

  const tagged = parsed.filter((p) => isFinite(p.amount));
  const untagged = parsed.filter((p) => !isFinite(p.amount));

  // No amounts at all (e.g. "cash, upi") → DO NOT invent allocations.
  // Bucket the entire amount into `legacy_unknown` for auditable reporting.
  if (tagged.length === 0) {
    return [{ mode: "legacy_unknown", amount: total }];
  }

  const taggedSum = tagged.reduce((a, b) => a + b.amount, 0);
  const splits: PaymentSplit[] = tagged.map((p) => ({ mode: p.mode, amount: p.amount }));

  if (untagged.length > 0) {
    // Partially tagged ("cash, upi:200"): honour tagged amounts, push the
    // remainder into legacy_unknown without guessing how to distribute it.
    const remainder = Math.max(0, total - taggedSum);
    if (remainder > 0) {
      splits.push({ mode: "legacy_unknown", amount: remainder });
    }
  }

  return splits;
};

/**
 * Aggregate billing_payments rows into per-mode totals.
 * Each row contributes its split breakdown exactly once.
 *
 * Grand total of the returned map === Σ rows.amount, so it can be safely
 * displayed alongside Collected without ever drifting.
 */
export const aggregatePaymentsByMode = (
  rows: Array<{ payment_method: string | null; amount: number | string | null }>
): Record<string, { amount: number; count: number }> => {
  const out: Record<string, { amount: number; count: number }> = {};
  REPORT_MODES.forEach((m) => (out[m] = { amount: 0, count: 0 }));

  for (const r of rows || []) {
    const amt = Number(r?.amount || 0);
    // Negative rows (bill adjustments / refunds) MUST be aggregated so
    // mode-wise totals stay in sync with the net Collected figure.
    if (!isFinite(amt) || amt === 0) continue;
    const splits = parsePaymentSplits(r?.payment_method, amt);
    for (const s of splits) {
      const bucket = reportBucket(s.mode);
      if (!out[bucket]) out[bucket] = { amount: 0, count: 0 };
      out[bucket].amount += s.amount;
      out[bucket].count += 1;
    }
  }
  return out;
};

/**
 * Pretty display for a raw payment_method string — used in tables/exports
 * where we want a human-friendly summary without losing the original value.
 *   "cash:500, upi:1240" → "Cash + UPI"
 *   "cash"               → "Cash"
 *   "cash, upi"          → "Cash + UPI (Legacy)"
 */
export const prettyPaymentMethod = (raw: string | null | undefined): string => {
  if (!raw || !String(raw).trim()) return "—";
  const tokens = String(raw)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length === 0) return "—";
  const allUntagged = tokens.every((t) => !t.includes(":"));
  const modes = tokens.map((t) => normalizeMode(t.split(":")[0]));
  const unique = Array.from(new Set(modes));
  const label = unique.map((m) => modeLabel(m)).join(" + ");
  return tokens.length > 1 && allUntagged ? `${label} (Legacy)` : label;
};
