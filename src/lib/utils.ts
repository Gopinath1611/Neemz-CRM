import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns the trimmed string representation of a value, or "—" when the value
 * is null/undefined/empty/whitespace-only. Use for table cell rendering so
 * placeholders never replace valid data and whitespace doesn't masquerade as data.
 */
export function displayOrDash(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const str = String(value).trim();
  return str.length > 0 ? str : "—";
}

/**
 * Display-only formatter: strips a leading country/dial code from a stored
 * phone string. Storage is never modified — this is used purely for rendering.
 *
 * Examples:
 *   displayPhone("+91 9876543210")            -> "9876543210"
 *   displayPhone("+91-98765-43210")           -> "9876543210"
 *   displayPhone("9876543210")                -> "9876543210"
 *   displayPhone("919876543210", "+91")       -> "9876543210"
 *   displayPhone(null)                        -> "—"
 */
export function displayPhone(
  phone: string | null | undefined,
  countryCode?: string | null,
): string {
  if (!phone) return "—";
  const raw = String(phone).trim();
  if (!raw) return "—";

  // Case 1: stored with a leading "+<dial>" prefix.
  if (raw.startsWith("+")) {
    // If a separator follows the dial code, it clearly delimits the prefix.
    const sep = raw.match(/^\+(\d{1,4})[\s-]+(.*)$/);
    if (sep) {
      const digits = sep[2].replace(/\D/g, "");
      return digits || raw;
    }
    // No separator: never guess a fixed prefix length (that truncated real
    // digits). Only strip a prefix when the remainder is a full 10-digit
    // subscriber number; otherwise keep every stored digit.
    const allDigits = raw.replace(/\D/g, "");
    for (let len = 1; len <= 4; len++) {
      if (allDigits.length - len === 10) {
        return allDigits.slice(len);
      }
    }
    return allDigits || raw;
  }


  // Case 2: a known dial code is supplied AND the digits begin with it.
  if (countryCode) {
    const dialDigits = String(countryCode).replace(/\D/g, "");
    const allDigits = raw.replace(/\D/g, "");
    if (dialDigits && allDigits.startsWith(dialDigits) && allDigits.length > dialDigits.length) {
      return allDigits.slice(dialDigits.length);
    }
    return allDigits || raw;
  }

  // Case 3: plain stored number — strip formatting characters only.
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}
