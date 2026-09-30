export const CATEGORY_GROUP_ORDER = [
  "Clinical",
  "Non-Clinical",
  "Other / Existing Categories",
] as const;

export type CategoryGroup = (typeof CATEGORY_GROUP_ORDER)[number];

interface Categorizable {
  id: string;
  name: string;
}

// UI-only grouping for the Inventory Category dropdown.
// Existing category names and IDs are never changed; this is purely presentation.
const CLINICAL_CATEGORIES = new Set([
  "Dental Materials",
  "Medications",
  "Consumables",
  "Disposables",
  "Hand Files",
  "Rotary Files",
  "GP POINTS",
  "PAPER POINTS",
  "Impression Trays",
  "Instruments",
]);

const NON_CLINICAL_CATEGORIES = new Set([
  "Non Clinical",
  "stationary  items",
]);

export function getCategoryGroup(name: string): CategoryGroup {
  const trimmed = name.trim();
  if (CLINICAL_CATEGORIES.has(trimmed)) return "Clinical";
  if (NON_CLINICAL_CATEGORIES.has(trimmed)) return "Non-Clinical";
  return "Other / Existing Categories";
}

export function groupCategories<T extends Categorizable>(
  categories: T[]
): { group: CategoryGroup; items: T[] }[] {
  const buckets: Record<CategoryGroup, T[]> = {
    Clinical: [],
    "Non-Clinical": [],
    "Other / Existing Categories": [],
  };

  categories.forEach((c) => {
    buckets[getCategoryGroup(c.name)].push(c);
  });

  return CATEGORY_GROUP_ORDER.map((group) => ({ group, items: buckets[group] }));
}
