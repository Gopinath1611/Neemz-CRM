import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Package, History, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickableItem {
  name: string;
  category?: string | null;
  unit?: string | null;
  unit_price?: number | null;
  supplier?: string | null;
  source: "inventory" | "history";
}

interface Props {
  value: string;
  onSelect: (item: PickableItem) => void;
  onTextChange: (text: string) => void;
  options: PickableItem[];
  placeholder?: string;
  filterCategory?: string;
}

export const PurchaseItemPicker = ({
  value,
  onSelect,
  onTextChange,
  options,
  placeholder,
  filterCategory,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQuery(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cat = filterCategory?.trim().toLowerCase() || "";
    const map = new Map<string, PickableItem>();
    options.forEach((o) => {
      const key = o.name?.trim().toLowerCase();
      if (!key) return;
      if (cat) {
        const oc = (o.category || "").trim().toLowerCase();
        if (oc !== cat) return;
      }
      const existing = map.get(key);
      if (!existing || (existing.source === "history" && o.source === "inventory")) {
        map.set(key, o);
      }
    });
    const list = Array.from(map.values());
    const result = !q ? list : list.filter((o) => o.name.toLowerCase().includes(q));
    // prioritize startsWith matches
    if (q) {
      result.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts;
      });
    }
    return result.slice(0, 50);
  }, [options, query, filterCategory]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const commit = (opt: PickableItem) => {
    setQuery(opt.name);
    onSelect(opt);
    setOpen(false);
    // refocus so the user can immediately retype to replace
    requestAnimationFrame(() => inputRef.current?.blur());
  };

  const clearSelection = () => {
    setQuery("");
    onTextChange("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onTextChange(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                setOpen(true);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                if (open && filtered[highlight]) {
                  e.preventDefault();
                  commit(filtered[highlight]);
                }
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder ?? "Search item..."}
            className="h-8 text-sm pr-7"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={clearSelection}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
              tabIndex={-1}
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] max-h-72 overflow-auto"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault();
        }}
      >
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No matches — type to add new
          </div>
        ) : (
          <ul className="py-1">
            {filtered.map((opt, i) => (
              <li
                key={`${opt.source}-${opt.name}-${i}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(opt);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex items-start gap-2 px-2 py-1.5 cursor-pointer text-sm",
                  i === highlight ? "bg-accent text-accent-foreground" : "",
                )}
              >
                {opt.source === "inventory" ? (
                  <Package className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                ) : (
                  <History className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{opt.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[opt.category, opt.unit, opt.unit_price ? `₹${opt.unit_price}` : null, opt.supplier]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};
