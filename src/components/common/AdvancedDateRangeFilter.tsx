import { useMemo, useState } from "react";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePreset, resolveDateRange } from "@/components/common/DateRangeFilter";

interface AdvancedDateRangeFilterProps {
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

export const AdvancedDateRangeFilter = ({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  hideAll = true,
  hideTomorrow = false,
  showYesterday = true,
  hideYesterday = false,
  showYear = false,
  hideToday = false,
  hideWeek = false,
  hideMonth = false,
  hideCustom = false,
}: AdvancedDateRangeFilterProps) => {
  const [open, setOpen] = useState(false);

  const allPresets = useMemo(
    () => [
      { value: "today" as DatePreset, label: "Today" },
      { value: "tomorrow" as DatePreset, label: "Tomorrow" },
      { value: "yesterday" as DatePreset, label: "Yesterday" },
      { value: "week" as DatePreset, label: "This Week" },
      { value: "month" as DatePreset, label: "This Month" },
      { value: "year" as DatePreset, label: "This Year" },
      { value: "all" as DatePreset, label: "All Time" },
      { value: "custom" as DatePreset, label: "Custom Range" },
    ],
    []
  );

  const visiblePresets = useMemo(
    () =>
      allPresets.filter((p) => {
        switch (p.value) {
          case "all":
            return !hideAll;
          case "today":
            return !hideToday;
          case "yesterday":
            return showYesterday && !hideYesterday;
          case "tomorrow":
            return !hideTomorrow;
          case "week":
            return !hideWeek;
          case "month":
            return !hideMonth;
          case "year":
            return showYear;
          case "custom":
            return !hideCustom;
          default:
            return true;
        }
      }),
    [allPresets, hideAll, hideToday, showYesterday, hideYesterday, hideTomorrow, hideWeek, hideMonth, showYear, hideCustom]
  );

  const displayLabel = useMemo(() => {
    if (preset === "custom" && (customFrom || customTo)) {
      const fromText = customFrom ? format(customFrom, "dd MMM yyyy") : "...";
      const toText = customTo ? format(customTo, "dd MMM yyyy") : "...";
      return `${fromText} - ${toText}`;
    }
    return visiblePresets.find((p) => p.value === preset)?.label ?? "Select";
  }, [preset, customFrom, customTo, visiblePresets]);

  const selectedRange = useMemo(() => {
    if (preset === "custom") {
      return customFrom || customTo ? { from: customFrom, to: customTo } : undefined;
    }
    const r = resolveDateRange(preset);
    return r.from && r.to ? { from: r.from, to: r.to } : undefined;
  }, [preset, customFrom, customTo]);

  const handlePresetClick = (value: DatePreset) => {
    onPresetChange(value);
    if (value !== "custom") {
      setOpen(false);
    }
  };

  const handleCalendarSelect = (range?: { from?: Date; to?: Date }) => {
    if (!range) return;
    onCustomFromChange(range.from);
    onCustomToChange(range.to);
    if (range.from && range.to) {
      onPresetChange("custom");
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
          <CalendarIcon className="h-4 w-4 mr-2 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 min-w-[520px]" align="end">
        <div className="flex">
          <div className="w-44 border-r p-3 space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Select</p>
            {visiblePresets.map((p) => (
              <Button
                key={p.value}
                type="button"
                variant={preset === p.value ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => handlePresetClick(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="p-3 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {preset === "custom" ? "Custom Range" : "Calendar"}
            </p>
            <Calendar
              mode="range"
              selected={selectedRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={1}
              initialFocus
              className={cn("p-0 pointer-events-auto")}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
