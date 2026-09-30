import { useMemo } from "react";
import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { indiaDayKey, isConnectedCall, type ReportCallRow } from "@/lib/periodicReportMetrics";

export const SLOTS = [
  "Total", "Before 10:00 AM", "10:00 AM - 10:59 AM", "11:00 AM - 11:59 AM", "12:00 PM - 12:59 PM",
  "01:00 PM - 01:59 PM", "02:00 PM - 02:59 PM", "03:00 PM - 03:59 PM", "04:00 PM - 04:59 PM",
  "05:00 PM - 05:59 PM", "06:00 PM - 06:59 PM", "After 07:00 PM",
];

export type Cell = { calls: number; connected: number; duration: number };
export const empty = (): Cell => ({ calls: 0, connected: 0, duration: 0 });

export const indiaHour = (iso: string) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));

/** Slot index 1..11 (0 = Total). */
export const slotOf = (hour: number) => (hour < 10 ? 1 : hour >= 19 ? 11 : hour - 8);

export const hms = (s: number) => {
  const t = Math.round(s);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
};

const dayLabel = (key: string) => {
  const d = new Date(`${key}T00:00:00+05:30`);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", ...o }).format(d);
  return `${f({ weekday: "long" })}, ${f({ day: "2-digit" })}-${f({ month: "short" })}-${f({ year: "numeric" })}`;
};

export const Cells = ({ c, fmt = (n: number) => String(n), className }: { c: Cell; fmt?: (n: number) => string; className?: string }) => (
  <>
    <td className={cn("border-l px-3 py-2 text-right tabular-nums", className)}>{fmt(c.calls)}</td>
    <td className={cn("px-3 py-2 text-right tabular-nums", className)}>{fmt(c.connected)}</td>
    <td className={cn("px-3 py-2 text-right tabular-nums", className)}>{hms(c.duration)}</td>
  </>
);

export default function DayWiseAnalysisTab({ calls }: { calls: ReportCallRow[] }) {
  const { days, total } = useMemo(() => {
    const byDay = new Map<string, Cell[]>();
    const total = SLOTS.map(empty);
    for (const call of calls) {
      if (!call.started_at) continue;
      const key = indiaDayKey(call.started_at);
      const row = byDay.get(key) ?? SLOTS.map(empty);
      byDay.set(key, row);
      const conn = isConnectedCall(call) ? 1 : 0;
      for (const i of [0, slotOf(indiaHour(call.started_at))]) {
        for (const c of [row[i], total[i]]) {
          c.calls++; c.connected += conn; c.duration += call.duration_seconds || 0;
        }
      }
    }
    return { days: [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a)), total };
  }, [calls]);

  const n = days.length;
  const avg = total.map((c) => ({ calls: n ? c.calls / n : 0, connected: n ? c.connected / n : 0, duration: n ? c.duration / n : 0 }));
  const zeroDays = SLOTS.map((_, i) => days.filter(([, r]) => r[i].calls === 0).length);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="text-sm font-medium">Business Days : {n}</div>
        {n === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No calls in the selected period</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-max min-w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 min-w-[220px] bg-muted px-3 py-2 text-left">Day</th>
                  {SLOTS.map((s) => (
                    <th key={s} colSpan={3} className="whitespace-nowrap border-l px-3 py-2 text-center">{s}</th>
                  ))}
                </tr>
                <tr className="text-xs text-muted-foreground">
                  {SLOTS.map((s) => ["Total Calls", "Total Connected Calls", "Total Duration"].map((h, j) => (
                    <th key={s + h} className={cn("whitespace-nowrap px-3 py-2 text-right font-medium", j === 0 && "border-l")}>{h}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {days.map(([key, row]) => (
                  <tr key={key} className="border-t hover:bg-muted/30">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 font-medium text-primary">{dayLabel(key)}</td>
                    {row.map((c, i) => <Cells key={i} c={c} />)}
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">Total</td>
                  {total.map((c, i) => <Cells key={i} c={c} />)}
                </tr>
                <tr className="border-t bg-warning/10 text-warning">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 font-semibold text-warning">Daily Average</td>
                  {avg.map((c, i) => <Cells key={i} c={c} fmt={(v) => v.toFixed(1)} />)}
                </tr>
                <tr className="border-t bg-destructive/10 text-destructive">
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 font-semibold text-destructive">
                    <span className="inline-flex items-center gap-1">
                      No of Days with no calls in Time Slot
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild><Info className="h-3.5 w-3.5" /></TooltipTrigger>
                          <TooltipContent>Business days (days with at least one call) that had zero calls in this slot</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </span>
                  </td>
                  {zeroDays.map((z, i) => (
                    <td key={i} colSpan={3} className="border-l px-3 py-2 text-center font-semibold tabular-nums">{z}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
