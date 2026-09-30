import { useEffect, useState } from "react";

import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, addDays, subDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DatePreset = "all" | "today" | "yesterday" | "tomorrow" | "week" | "month" | "year" | "custom";

interface DateRangeFilterProps {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customFrom?: Date;
  customTo?: Date;
  onCustomFromChange: (d: Date | undefined) => void;
  onCustomToChange: (d: Date | undefined) => void;
  /** Hide "All Time" option (e.g. when query requires a date range) */
  hideAll?: boolean;
  /** Hide "Tomorrow" option (e.g. for historical reports) */
  hideTomorrow?: boolean;
  /** Show "Yesterday" option */
  showYesterday?: boolean;
  /** Hide "Yesterday" option */
  hideYesterday?: boolean;
  /** Show "This Year" option */
  showYear?: boolean;
  /** Hide "Today" option */
  hideToday?: boolean;
  /** Hide "This Week" option */
  hideWeek?: boolean;
  /** Hide "This Month" option */
  hideMonth?: boolean;
  /** Hide "Custom" option */
  hideCustom?: boolean;
}

export const DateRangeFilter = ({
  preset, onPresetChange,
  customFrom, customTo,
  onCustomFromChange, onCustomToChange,
  hideAll = true,
  hideTomorrow = false,
  showYesterday = true,
  hideYesterday = false,
  showYear = false,
  hideToday = false,
  hideWeek = false,
  hideMonth = false,
  hideCustom = false,
}: DateRangeFilterProps) => {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={(v) => onPresetChange(v as DatePreset)}>
        <SelectTrigger className="w-[130px]">
          <CalendarIcon className="h-4 w-4 mr-1" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!hideAll && <SelectItem value="all">All Time</SelectItem>}
          {!hideToday && <SelectItem value="today">Today</SelectItem>}
          {showYesterday && !hideYesterday && <SelectItem value="yesterday">Yesterday</SelectItem>}
          {!hideTomorrow && <SelectItem value="tomorrow">Tomorrow</SelectItem>}
          {!hideWeek && <SelectItem value="week">This Week</SelectItem>}
          {!hideMonth && <SelectItem value="month">This Month</SelectItem>}
          {showYear && <SelectItem value="year">This Year</SelectItem>}
          {!hideCustom && <SelectItem value="custom">Custom</SelectItem>}
        </SelectContent>
      </Select>
      {preset === "custom" && (
        <>
          <Popover open={fromOpen} onOpenChange={setFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("text-xs", !customFrom && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-1" />
                {customFrom ? format(customFrom, "dd MMM yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customFrom}
                onSelect={(d) => {
                  onCustomFromChange(d);
                  if (d) {
                    setFromOpen(false);
                    if (!customTo) setToOpen(true);
                  }
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <Popover open={toOpen} onOpenChange={setToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("text-xs", !customTo && "text-muted-foreground")}>
                <CalendarIcon className="h-4 w-4 mr-1" />
                {customTo ? format(customTo, "dd MMM yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={customTo}
                onSelect={(d) => {
                  onCustomToChange(d);
                  if (d) setToOpen(false);
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
};

/** Resolve preset + custom range into [from, to] Date objects (or undefined for "all") */
export const resolveDateRange = (
  preset: DatePreset,
  customFrom?: Date,
  customTo?: Date
): { from?: Date; to?: Date } => {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "tomorrow": {
      const t = addDays(now, 1);
      return { from: startOfDay(t), to: endOfDay(t) };
    }
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "year":
      return { from: startOfYear(now), to: endOfYear(now) };
    case "custom":
      return {
        from: customFrom ? startOfDay(customFrom) : undefined,
        to: customTo ? endOfDay(customTo) : undefined,
      };
    default:
      return {};
  }
};

/** Convenience hook for managing preset + custom dates. Pass `persistKey` to
 *  persist the filter across page navigations within the same browser session
 *  (sessionStorage — resets when the tab is closed, so a fresh daily open
 *  falls back to `initialPreset`). */
export const useDateRangeFilter = (
  initialPreset: DatePreset = "today",
  persistKey?: string,
) => {
  const storageKey = persistKey ? `dateRangeFilter:${persistKey}` : undefined;
  const readStored = () => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) as { preset: DatePreset; customFrom?: string; customTo?: string } : null;
    } catch { return null; }
  };
  const stored = readStored();
  const [preset, setPreset] = useState<DatePreset>(stored?.preset ?? initialPreset);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(stored?.customFrom ? new Date(stored.customFrom) : undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(stored?.customTo ? new Date(stored.customTo) : undefined);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        preset,
        customFrom: customFrom ? customFrom.toISOString() : undefined,
        customTo: customTo ? customTo.toISOString() : undefined,
      }));
    } catch { /* ignore */ }
  }, [storageKey, preset, customFrom, customTo]);

  const range = resolveDateRange(preset, customFrom, customTo);
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, range };
};
