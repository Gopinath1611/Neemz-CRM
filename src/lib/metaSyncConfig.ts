/**
 * Central config for Meta (Facebook / Instagram) insights & ad-campaign
 * live auto-sync. Kept here so every surface that polls the Graph API
 * shares the same interval + rate-limit behaviour.
 */

export const META_SYNC_INTERVAL_OPTIONS = [
  { label: "1 min", value: 60_000 },
  { label: "5 min", value: 300_000 },
  { label: "10 min", value: 600_000 },
  { label: "15 min", value: 900_000 },
] as const;

/** Default auto-sync cadence: 5 minutes (was 30s, which tripped Graph API limits). */
export const META_SYNC_DEFAULT_INTERVAL_MS = 300_000;

/** Manual Sync / Refresh button cooldown to prevent rapid clicking. */
export const META_MANUAL_COOLDOWN_MS = 30_000;

/** How long auto-sync pauses after Meta returns "(#4) Application request limit reached". */
export const META_RATE_LIMIT_PAUSE_MS = 15 * 60_000;

export const META_SYNC_INTERVAL_STORAGE_KEY = "meta_sync_interval_ms";

/** Detects Meta's application-level rate limit error in any error shape. */
export const isMetaRateLimitError = (message?: string | null): boolean => {
  if (!message) return false;
  const m = String(message).toLowerCase();
  return (
    m.includes("(#4)") ||
    m.includes("application request limit") ||
    m.includes("request limit reached") ||
    m.includes("too many calls")
  );
};

export const loadMetaSyncInterval = (): number => {
  if (typeof window === "undefined") return META_SYNC_DEFAULT_INTERVAL_MS;
  const raw = Number(window.localStorage.getItem(META_SYNC_INTERVAL_STORAGE_KEY));
  const allowed = META_SYNC_INTERVAL_OPTIONS.some(o => o.value === raw);
  return allowed ? raw : META_SYNC_DEFAULT_INTERVAL_MS;
};

export const saveMetaSyncInterval = (ms: number) => {
  try { window.localStorage.setItem(META_SYNC_INTERVAL_STORAGE_KEY, String(ms)); } catch {}
};
