import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  BookOpen,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface ShiftInfo {
  shift_name: string;
  start_time: string;
  end_time: string;
  weekly_off_days: number[];
}

const DEFAULT_SHIFT: ShiftInfo = {
  shift_name: "General",
  start_time: "09:00:00",
  end_time: "18:00:00",
  weekly_off_days: [0],
};

/** "09:00:00" -> "09:00" */
const shortTime = (t: string | null | undefined) => (t ?? "").slice(0, 5) || "--:--";

/* ----------------------------- component ----------------------------- */

const MyShift = () => {
  const { user } = useAuth();
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [shift, setShift] = useState<ShiftInfo>(DEFAULT_SHIFT);

  /* Resolve logged-in user's employee -> latest assigned shift (fallback: General) */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !emp) return;
      const { data: sh } = await supabase
        .from("employee_shifts")
        .select("shift_name, start_time, end_time, weekly_off_days")
        .eq("employee_id", emp.id)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && sh?.shift_name) setShift(sh as ShiftInfo);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const gridDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
      }),
    [month],
  );

  const goPrev = () => setMonth((m) => subMonths(m, 1));
  const goNext = () => setMonth((m) => addMonths(m, 1));

  return (
    <div className="space-y-4">
      {/* ===== Top Action Header Bar ===== */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: blue header bar */}
        <div className="flex items-center gap-2 rounded-lg border-l-4 border-l-primary bg-primary/5 px-4 py-3">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">My shift</h1>
        </div>

        {/* Center: month & year navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold capitalize">{format(month, "MMMM yyyy")}</span>
          </div>
          <Button variant="outline" size="icon" onClick={goNext} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Right: options menu */}
        <Button variant="ghost" size="icon" aria-label="Options">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* ===== Monthly Shift Calendar Grid ===== */}
      <div className="overflow-x-auto rounded-lg border bg-muted/30">
        <div className="min-w-[760px]">
          {/* Day name header row */}
          <div className="grid grid-cols-7 border-b bg-background">
            {WEEK_DAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div className="grid grid-cols-7">
            {gridDays.map((day, idx) => {
              const inMonth = isSameMonth(day, month);
              const isOffDay = (shift.weekly_off_days ?? [0]).includes(day.getDay());
              const today = isToday(day);

              return (
                <div
                  key={idx}
                  className={cn(
                    "min-h-[112px] border-b border-r p-2 text-left",
                    !inMonth && "bg-muted/20",
                    today && inMonth && "bg-green-50",
                    (idx + 1) % 7 === 0 && "border-r-0",
                  )}
                >
                  {/* date number top-right */}
                  <div className="mb-1.5 flex justify-end">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        inMonth ? "text-foreground" : "text-muted-foreground/40",
                        today && "rounded-full bg-green-100 px-1.5 py-0.5 font-bold text-green-700",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>

                  {/* cell content */}
                  {inMonth && (
                    <div className="space-y-1">
                      {isOffDay ? (
                        // Off-day indicator
                        <div className="rounded-md bg-muted px-2 py-1 text-center text-[11px] font-medium text-muted-foreground">
                          Day off
                        </div>
                      ) : (
                        // Shift block: name + timings (light blue container, dark blue left border)
                        <div className="min-h-[48px] rounded-md border-l-4 border-l-blue-800 bg-blue-50 px-2 py-1.5">
                          <div className="truncate text-[11px] font-semibold text-blue-900">
                            {shift.shift_name}
                          </div>
                          <div className="text-[11px] font-medium text-blue-700">
                            {shortTime(shift.start_time)} - {shortTime(shift.end_time)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyShift;
