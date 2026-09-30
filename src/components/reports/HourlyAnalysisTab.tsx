import { useMemo, useState } from "react";
import { BarChart3, LineChart as LineIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isConnectedCall, type ReportCallRow } from "@/lib/periodicReportMetrics";
import { Cells, SLOTS, empty, hms, indiaHour, slotOf, type Cell } from "./DayWiseAnalysisTab";

type Names = Map<string, { name: string; number: string }>;

const add = (c: Cell, call: ReportCallRow) => {
  c.calls++;
  c.connected += isConnectedCall(call) ? 1 : 0;
  c.duration += call.duration_seconds || 0;
};

const pct = (v: number, t: number) => (t ? `${((v / t) * 100).toFixed(2)}%` : "0.00%");

export default function HourlyAnalysisTab({ calls, names }: { calls: ReportCallRow[]; names: Names }) {
  const [chart, setChart] = useState<"line" | "bar">("line");

  const { total, employees } = useMemo(() => {
    const total = SLOTS.map(empty);
    const byEmp = new Map<string, Cell[]>();
    for (const call of calls) {
      if (!call.started_at) continue;
      const key = call.telecaller_id ?? "unassigned";
      const row = byEmp.get(key) ?? SLOTS.map(empty);
      byEmp.set(key, row);
      for (const i of [0, slotOf(indiaHour(call.started_at))]) {
        add(total[i], call);
        add(row[i], call);
      }
    }
    const employees = [...byEmp.entries()]
      .map(([id, row]) => ({ id, name: names.get(id)?.name ?? (id === "unassigned" ? "Unassigned" : "Unknown"), row }))
      .sort((a, b) => b.row[0].calls - a.row[0].calls);
    return { total, employees };
  }, [calls, names]);

  const slots = SLOTS.slice(1).map((label, i) => ({ label, ...total[i + 1] }));
  const t = total[0];
  const chartData = slots.map((s) => ({ slot: s.label, "Total Calls": s.calls, "Connected Calls": s.connected }));
  const ChartEl = chart === "line" ? LineChart : BarChart;

  if (t.calls === 0) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No calls in the selected period
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {["Hourly Time Slot", "Total Calls", "Total Connected Calls", "Total Duration", "Total Calls (%)", "Total Connected Calls (%)", "Total Duration (%)"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap px-3 py-2 font-medium", i ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.label} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{s.label}</td>
                    {[s.calls, s.connected, hms(s.duration), pct(s.calls, t.calls), pct(s.connected, t.connected), pct(s.duration, t.duration)].map((v, i) => (
                      <td key={i} className="px-3 py-2 text-right tabular-nums">{v}</td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  {[t.calls, t.connected, hms(t.duration), "100.00%", t.connected ? "100.00%" : "0.00%", t.duration ? "100.00%" : "0.00%"].map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums">{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Employee Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-max min-w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 min-w-[180px] bg-muted px-3 py-2 text-left">Employee</th>
                  {SLOTS.map((s) => <th key={s} colSpan={3} className="whitespace-nowrap border-l px-3 py-2 text-center">{s}</th>)}
                </tr>
                <tr className="text-xs text-muted-foreground">
                  {SLOTS.map((s) => ["Total Calls", "Total Connected Calls", "Total Duration"].map((h, j) => (
                    <th key={s + h} className={cn("whitespace-nowrap px-3 py-2 text-right font-medium", j === 0 && "border-l")}>{h}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-2 font-medium">{e.name}</td>
                    {e.row.map((c, i) => <Cells key={i} c={c} />)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Calls vs Connected Calls</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant={chart === "line" ? "outline" : "ghost"} onClick={() => setChart("line")}>
              <LineIcon className="mr-1 h-4 w-4" /> Line Chart
            </Button>
            <Button size="sm" variant={chart === "bar" ? "outline" : "ghost"} onClick={() => setChart("bar")}>
              <BarChart3 className="mr-1 h-4 w-4" /> Bar Chart
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ChartEl data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="slot" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend verticalAlign="top" />
              {chart === "line" ? (
                <>
                  <Line type="monotone" dataKey="Total Calls" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="Connected Calls" stroke="hsl(var(--success, 142 71% 45%))" strokeWidth={2} />
                </>
              ) : (
                <>
                  <Bar dataKey="Total Calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Connected Calls" fill="hsl(var(--success, 142 71% 45%))" radius={[4, 4, 0, 0]} />
                </>
              )}
            </ChartEl>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
