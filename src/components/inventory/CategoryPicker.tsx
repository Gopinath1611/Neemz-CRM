import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { groupCategories, getCategoryGroup, type CategoryGroup } from "@/lib/inventoryCategoryGroups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Search, Check, Pencil, Trash2, Plus,
  Pill, Package, Droplet, Trash2 as DisposableIcon, Folder, FileText,
  LayoutGrid, Wrench, Home, HelpCircle, Tag,
} from "lucide-react";

type CategoryItem = { id: string; name: string };

interface CategoryPickerProps {
  value: string;
  onChange: (value: string) => void;
  categories: CategoryItem[];
  items?: Array<{ category_id?: string | null; inventory_categories?: { name: string } | null }>;
  placeholder?: string;
  className?: string;
  /** show the "All" option (used by filters) */
  allowAll?: boolean;
  /** label for the "All" option */
  allLabel?: string;
  /** show "Uncategorized" as a synthetic option (used by filters) */
  allowUncategorized?: boolean;
  /** show inline edit/delete actions for each category */
  onEdit?: (category: CategoryItem) => void;
  onDelete?: (category: CategoryItem) => void;
  onAdd?: () => void;
  /** footer hint when no categories exist */
  emptyHint?: string;
}

const FREQUENT_COUNT = 4;

const categoryIconMap: Record<string, React.ElementType> = {
  pill: Pill,
  package: Package,
  droplet: Droplet,
  trash2: DisposableIcon,
  folder: Folder,
  "file-text": FileText,
  "layout-grid": LayoutGrid,
  wrench: Wrench,
  home: Home,
  "help-circle": HelpCircle,
  tag: Tag,
};

function getCategoryIconKey(name: string): string {
  const n = name.trim().toLowerCase();
  if (n.includes("medication") || n.includes("medicine") || n.includes("drug")) return "pill";
  if (n.includes("dental material")) return "package";
  if (n.includes("consumable")) return "droplet";
  if (n.includes("disposable")) return "trash2";
  if (n.includes("file")) return "folder";
  if (n.includes("points") || n.includes("point")) return "file-text";
  if (n.includes("tray")) return "layout-grid";
  if (n.includes("instrument")) return "wrench";
  if (n.includes("non clinical") || n.includes("non-clinical")) return "home";
  if (n.includes("stationary") || n.includes("stationery")) return "file-text";
  if (n.includes("uncategorized")) return "help-circle";
  return "tag";
}

function getGroupBadgeClass(group: CategoryGroup | "Uncategorized"): string {
  switch (group) {
    case "Clinical":
      return "bg-primary/10 text-primary border-primary/20";
    case "Non-Clinical":
      return "bg-info/10 text-info border-info/20";
    case "Other / Existing Categories":
      return "bg-muted text-muted-foreground border-border";
    case "Uncategorized":
      return "bg-warning/10 text-warning border-warning/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function CategoryPicker({
  value,
  onChange,
  categories,
  items = [],
  placeholder = "Select category",
  className,
  allowAll = false,
  allLabel = "All Categories",
  allowUncategorized = false,
  onEdit,
  onDelete,
  onAdd,
  emptyHint,
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedCategory = categories.find((c) => c.id === value);
  const displayLabel = allowAll && value === "all"
    ? allLabel
    : allowUncategorized && value === "uncategorized"
      ? "Uncategorized"
      : selectedCategory?.name || placeholder;

  const normalizedQuery = query.trim().toLowerCase();

  // Pull Uncategorized out into its own section
  const { regularCategories, uncategorized } = useMemo(() => {
    const regular: CategoryItem[] = [];
    let uncat: CategoryItem | undefined;
    categories.forEach((c) => {
      if (c.name.trim().toLowerCase() === "uncategorized") {
        uncat = c;
      } else {
        regular.push(c);
      }
    });
    return { regularCategories: regular, uncategorized: uncat };
  }, [categories]);

  const grouped = useMemo(() => groupCategories(regularCategories), [regularCategories]);

  // Frequently used categories derived from actual item counts
  const frequentCategories = useMemo(() => {
    if (!items || items.length === 0) return [];
    const counts: Record<string, number> = {};
    items.forEach((it) => {
      const id = it.category_id;
      if (!id) return;
      counts[id] = (counts[id] || 0) + 1;
    });
    return categories
      .map((c) => ({ category: c, count: counts[c.id] || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, FREQUENT_COUNT)
      .map((x) => x.category);
  }, [items, categories]);

  const filterByQuery = (list: CategoryItem[]) =>
    list.filter((c) => c.name.toLowerCase().includes(normalizedQuery));

  const filteredFrequent = filterByQuery(frequentCategories);
  const filteredGrouped = grouped
    .map(({ group, items }) => ({ group, items: filterByQuery(items) }))
    .filter((g) => g.items.length > 0);
  const uncategorizedMatch = uncategorized &&
    (normalizedQuery === "" || uncategorized.name.toLowerCase().includes(normalizedQuery));

  const allOptionMatch = allowAll && (normalizedQuery === "" || "all".includes(normalizedQuery) || allLabel.toLowerCase().includes(normalizedQuery));
  const uncategorizedOptionMatch = allowUncategorized && (normalizedQuery === "" || "uncategorized".includes(normalizedQuery));

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const CategoryRow = ({ category, group }: { category: CategoryItem; group: CategoryGroup | "Uncategorized" }) => {
    const Icon = categoryIconMap[getCategoryIconKey(category.name)];
    const isSelected = value === category.id;
    return (
      <div
        key={category.id}
        className={cn(
          "group flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors",
          isSelected && "bg-accent"
        )}
        onClick={() => handleSelect(category.id)}
        role="option"
        aria-selected={isSelected}
      >
        <Badge variant="outline" className={cn("h-6 w-6 p-0 justify-center rounded-full", getGroupBadgeClass(group))}>
          <Icon size={12} />
        </Badge>
        <span className="flex-1 text-sm truncate">{category.name}</span>
        {isSelected && <Check size={14} className="text-primary" />}
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit(category); }}
                className="p-1 rounded hover:bg-secondary"
                aria-label="Edit category"
              >
                <Pencil size={12} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(category); }}
                className="p-1 rounded hover:bg-destructive/20 text-destructive"
                aria-label="Delete category"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );

  const hasResults =
    allOptionMatch ||
    uncategorizedOptionMatch ||
    filteredFrequent.length > 0 ||
    filteredGrouped.length > 0 ||
    uncategorizedMatch;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-between font-normal", className)}
          aria-haspopup="listbox"
        >
          <span className="truncate">{displayLabel}</span>
          <Search size={14} className="text-muted-foreground ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-2">
          {categories.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              {emptyHint || "No categories available."}
            </div>
          )}

          {allOptionMatch && (
            <>
              <SectionLabel>Default</SectionLabel>
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors",
                  value === "all" && "bg-accent"
                )}
                onClick={() => handleSelect("all")}
                role="option"
                aria-selected={value === "all"}
              >
                <Badge variant="outline" className="h-6 w-6 p-0 justify-center rounded-full bg-muted text-muted-foreground border-border">
                  <Tag size={12} />
                </Badge>
                <span className="flex-1 text-sm">{allLabel}</span>
                {value === "all" && <Check size={14} className="text-primary" />}
              </div>
            </>
          )}

          {filteredFrequent.length > 0 && (
            <>
              <SectionLabel>Frequently Used</SectionLabel>
              {filteredFrequent.map((c) => (
                <CategoryRow key={c.id} category={c} group={getCategoryGroup(c.name)} />
              ))}
            </>
          )}

          {filteredGrouped.map(({ group, items }) => (
            <div key={group}>
              <SectionLabel>{group}</SectionLabel>
              {items.map((c) => (
                <CategoryRow key={c.id} category={c} group={group} />
              ))}
            </div>
          ))}

          {uncategorizedOptionMatch && (
            <>
              <SectionLabel>Without Category</SectionLabel>
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent transition-colors",
                  value === "uncategorized" && "bg-accent"
                )}
                onClick={() => handleSelect("uncategorized")}
                role="option"
                aria-selected={value === "uncategorized"}
              >
                <Badge variant="outline" className="h-6 w-6 p-0 justify-center rounded-full bg-warning/10 text-warning border-warning/20">
                  <HelpCircle size={12} />
                </Badge>
                <span className="flex-1 text-sm">Uncategorized</span>
                {value === "uncategorized" && <Check size={14} className="text-primary" />}
              </div>
            </>
          )}

          {uncategorizedMatch && !allowUncategorized && (
            <>
              <SectionLabel>Without Category</SectionLabel>
              <CategoryRow category={uncategorized} group="Uncategorized" />
            </>
          )}

          {!hasResults && categories.length > 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No categories match “{query}”.
            </div>
          )}
        </div>

        {onAdd && (
          <div className="p-2 border-t">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs h-8"
              onClick={() => { onAdd(); setOpen(false); }}
            >
              <Plus size={14} className="mr-1.5" /> Add Category
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
