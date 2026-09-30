import { useRef, useState } from "react";
import { format, startOfDay, endOfDay, isSameDay, isWithinInterval } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePreset, resolveDateRange } from "./DateRangeFilter";

interface Props {
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customFrom?: Date;
  customTo?: Date;
  onCustomFromChange: (d: Date | undefined) => void;
  onCustomToChange: (d: Date | undefined) => void;
  hideAll?: boolean;
  /** Show "Yesterday" instead of "Tomorrow" (past-facing data views) */
  pastMode?: boolean;
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
];


const DOUBLE_CLICK_MS = 400;

export const SmartDateFilter = ({
  preset, onPresetChange,
  customFrom, customTo,
  onCustomFromChange, onCustomToChange,
  hideAll = true,
  pastMode = false,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>(undefined);
  const lastClickRef = useRef<{ day: Date; ts: number } | null>(null);
  const range = resolveDateRange(preset, customFrom, customTo);

  const label = (() => {
    if (preset === "all") return "All Time";
    const p = PRESETS.find((x) => x.value === preset);
    if (p && preset !== "custom") return p.label;
    if (range.from && range.to) {
      if (isSameDay(range.from, range.to)) return format(range.from, "dd MMM yyyy");
      return `${format(range.from, "dd MMM")} – ${format(range.to, "dd MMM yyyy")}`;
    }
    return "Select date";
  })();

  const choosePreset = (p: DatePreset) => {
    onPresetChange(p);
    if (p !== "custom") {
      onCustomFromChange(undefined);
      onCustomToChange(undefined);
    }
    setPendingFrom(undefined);
    lastClickRef.current = null;
    if (p !== "custom") setOpen(false);
  };


  const applySingle = (day: Date) => {
    onCustomFromChange(startOfDay(day));
    onCustomToChange(endOfDay(day));
    onPresetChange("custom");
    setPendingFrom(undefined);
    lastClickRef.current = null;
    setOpen(false);
  };

  const applyRange = (from: Date, to: Date) => {
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    onCustomFromChange(startOfDay(a));
    onCustomToChange(endOfDay(b));
    onPresetChange("custom");
    setPendingFrom(undefined);
    lastClickRef.current = null;
    setOpen(false);
  };

  const handleDayClick = (day: Date) => {
    const now = Date.now();
    const last = lastClickRef.current;

    // Double-click on same day → single date
    if (last && isSameDay(last.day, day) && now - last.ts < DOUBLE_CLICK_MS) {
      applySingle(day);
      return;
    }
    lastClickRef.current = { day, ts: now };

    if (!pendingFrom) {
      setPendingFrom(day);
    } else {
      applyRange(pendingFrom, day);
    }
  };

  const modifiers: Record<string, (date: Date) => boolean> = {
    selectedStart: (d) => !!pendingFrom && isSameDay(d, pendingFrom),
  };
  if (!pendingFrom && range.from && range.to) {
    modifiers.rangeStart = (d) => isSameDay(d, range.from!);
    modifiers.rangeEnd = (d) => isSameDay(d, range.to!);
    modifiers.rangeMiddle = (d) =>
      d > range.from! && d < range.to! && isWithinInterval(d, { start: range.from!, end: range.to! });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setPendingFrom(undefined);
          lastClickRef.current = null;
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 min-w-[160px] justify-start">
          <CalendarIcon className="h-4 w-4" />
          <span className="text-xs">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col sm:flex-row">
          <div className="flex sm:flex-col gap-1 p-2 border-b sm:border-b-0 sm:border-r border-border bg-muted/30 min-w-[120px]">
            {PRESETS.filter((p) => !(hideAll && p.value === "all"))
              .filter((p) => (pastMode ? p.value !== "tomorrow" : p.value !== "yesterday"))
              .map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? "default" : "ghost"}
                size="sm"
                className="justify-start text-xs h-8"
                onClick={() => choosePreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="p-2">
            <Calendar
              {...({
                mode: "default",
                onDayClick: handleDayClick,
                modifiers,
                modifiersClassNames: {
                  selectedStart: "bg-primary text-primary-foreground rounded-md",
                  rangeStart: "bg-primary text-primary-foreground rounded-l-md",
                  rangeEnd: "bg-primary text-primary-foreground rounded-r-md",
                  rangeMiddle: "bg-accent text-accent-foreground",
                },
                numberOfMonths: 1,
                initialFocus: true,
                defaultMonth: range.from ?? pendingFrom ?? new Date(),
                captionLayout: "dropdown-buttons",
                fromYear: 2000,
                toYear: new Date().getFullYear() + 5,
                classNames: {
                  caption_label: "hidden",
                  caption_dropdowns: "flex gap-1 justify-center",
                  dropdown: "bg-background border border-input rounded px-1 py-0.5 text-xs",
                  dropdown_month: "text-xs",
                  dropdown_year: "text-xs",
                  vhidden: "hidden",
                },
              } as any)}
              className={cn("p-2 pointer-events-auto")}
            />
            <p className="text-[10px] text-muted-foreground px-2 pb-1">
              {pendingFrom
                ? `Start: ${format(pendingFrom, "dd MMM")} — click end date, or double-click same date for single day.`
                : "Double-click a date for a single day, or click two dates for a range."}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
