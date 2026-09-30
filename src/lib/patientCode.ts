// Formats a numeric patient_code as PT-prefixed, zero-padded code (e.g. 1 -> "PT0001")
export const formatPatientCode = (code: number | string | null | undefined): string => {
  if (code === null || code === undefined || code === "") return "—";
  const num = typeof code === "number" ? code : parseInt(String(code), 10);
  if (isNaN(num)) return String(code);
  return `PT${String(num).padStart(4, "0")}`;
};
