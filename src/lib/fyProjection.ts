// Helpers for Financial Year Projection Planner

export const FY_MONTHS = [
  { num: 4, short: "Apr", full: "April" },
  { num: 5, short: "May", full: "May" },
  { num: 6, short: "Jun", full: "June" },
  { num: 7, short: "Jul", full: "July" },
  { num: 8, short: "Aug", full: "August" },
  { num: 9, short: "Sep", full: "September" },
  { num: 10, short: "Oct", full: "October" },
  { num: 11, short: "Nov", full: "November" },
  { num: 12, short: "Dec", full: "December" },
  { num: 1, short: "Jan", full: "January" },
  { num: 2, short: "Feb", full: "February" },
  { num: 3, short: "Mar", full: "March" },
];

export const DEPARTMENTS = [
  "Implants",
  "Orthodontics",
  "Smile Design",
  "General Dentistry",
  "Preventive Dentistry",
  "Pediatric Dentistry",
];

export const MARKETING_CHANNELS = [
  { value: "meta_ads", label: "Meta Ads" },
  { value: "google_ads", label: "Google Ads" },
  { value: "whatsapp_campaigns", label: "WhatsApp Campaigns" },
  { value: "referral_programs", label: "Referral Programs" },
  { value: "local_camps", label: "Local Camps" },
  { value: "school_dental_programs", label: "School Dental Programs" },
  { value: "corporate_tieups", label: "Corporate Tie-ups" },
];

export const generateFYOptions = (): string[] => {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    `${year - 1}-${String(year).slice(2)}`,
    `${year}-${String(year + 1).slice(2)}`,
    `${year + 1}-${String(year + 2).slice(2)}`,
  ];
};

export const getCurrentFY = (): string => {
  const now = new Date();
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
};

export const getCurrentFYMonth = (): number => new Date().getMonth() + 1;

export const formatINR = (n: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export const variancePercent = (actual: number, target: number): number => {
  if (!target) return 0;
  return ((actual - target) / target) * 100;
};

export const varianceColor = (status: string): string => {
  if (status === "green") return "text-emerald-600 bg-emerald-500/10 border-emerald-500/30";
  if (status === "yellow") return "text-amber-600 bg-amber-500/10 border-amber-500/30";
  return "text-rose-600 bg-rose-500/10 border-rose-500/30";
};

export const computeStatus = (actual: number, target: number): "green" | "yellow" | "red" => {
  if (!target) return "green";
  if (actual >= target) return "green";
  if (actual >= target * 0.9) return "yellow";
  return "red";
};
