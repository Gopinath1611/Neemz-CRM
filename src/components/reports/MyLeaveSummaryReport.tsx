import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Download, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  fromDate?: string;
  toDate?: string;
}

type LeaveRow = {
  id: string;
  leave_type: string | null;
  start_date: string;
  end_date: string;
  days: number | null;
  status: string | null;
  reason: string | null;
  reporting_person?: string | null;
};

type CompOffRow = {
  id: string;
  status: string | null;
  days?: number | null;
  work_date?: string | null;
  created_at?: string | null;
};

const isLop = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  return v.includes("lop") || v.includes("unpaid") || v.includes("loss of pay");
};
const isCompOff = (t?: string | null) => {
  const v = (t || "").toLowerCase();
  return v.includes("comp") && v.includes("off");
};

/** Simple SVG doughnut with segments */
function Doughnut({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" strokeWidth="16" className="stroke-muted" />
      {total > 0 &&
        segments.map((s, i) => {
          const len = (Math.max(0, s.value) / total) * c;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              strokeWidth="16"
              stroke={s.color}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
    </svg>
  );
}

export function LegendCard({
  title,
  segments,
  legends,
  centerLabel,
  centerValue,
}: {
  title: string;
  segments: { value: number; color: string }[];
  legends: { label: string; value: number | string; color?: string }[];
  centerLabel: string;
  centerValue: number | string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <Badge variant="secondary">Tracker</Badge>
        </div>
        <div className="mt-4 flex items-center gap-5">
          <div className="relative shrink-0">
            <Doughnut segments={segments} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold">{centerValue}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {centerLabel}
              </span>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5">
            {legends.map((l) => (
              <div key={l.label} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {l.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: l.color }}
                    />
                  )}
                  {l.label}
                </span>
                <span className="font-medium">{l.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyLeaveSummaryReport({ fromDate, toDate }: Props) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [from, setFrom] = useState(fromDate || `${thisYear}-01-01`);
  const [to, setTo] = useState(toDate || `${thisYear}-12-31`);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [compOffs, setCompOffs] = useState<CompOffRow[]>([]);

  const shiftYear = (delta: number) => {
    const y = year + delta;
    setYear(y);
    setFrom(`${y}-01-01`);
    setTo(`${y}-12-31`);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) throw new Error("Not signed in");

      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!emp) {
        setLeaves([]);
        setCompOffs([]);
        setGenerated(true);
        toast.info("No employee profile linked to your account");
        return;
      }

      const [{ data: lr }, { data: co }] = await Promise.all([
        supabase
          .from("leave_requests")
          .select("id, leave_type, start_date, end_date, days, status, reason, reporting_person")
          .eq("employee_id", emp.id)
          .gte("start_date", from)
          .lte("start_date", to)
          .order("start_date", { ascending: false }),
        supabase.from("comp_off_requests").select("*").eq("employee_id", emp.id),
      ]);
      setLeaves((lr as any) || []);
      setCompOffs(((co as any) || []).filter((r: any) => {
        const d = r.working_date || r.work_date || r.created_at;
        return !d || (String(d).slice(0, 10) >= from && String(d).slice(0, 10) <= to);
      }));
    } catch (e: any) {
      toast.error(e.message || "Failed to load your leave summary");
    } finally {
      setLoading(false);
      setGenerated(true);
    }
  };

  useEffect(() => {
    if (generated) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const compOffStats = useMemo(() => {
    const approved = compOffs.filter((c) => (c.status || "").toLowerCase() === "approved");
    const approvedDays = approved.reduce((s, c) => s + (Number(c.days) || 1), 0);
    const consumed = leaves
      .filter((l) => isCompOff(l.leave_type) && (l.status || "").toLowerCase() === "approved")
      .reduce((s, l) => s + (Number(l.days) || 0), 0);
    const expired = compOffs
      .filter((c) => (c.status || "").toLowerCase() === "expired")
      .reduce((s, c) => s + (Number(c.days) || 1), 0);
    const available = Math.max(0, approvedDays - consumed - expired);
    return { approved: approvedDays, consumed, available, expired };
  }, [compOffs, leaves]);

  const lopStats = useMemo(() => {
    const consumed = leaves
      .filter((l) => isLop(l.leave_type) && (l.status || "").toLowerCase() === "approved")
      .reduce((s, l) => s + (Number(l.days) || 0), 0);
    return {
      annualQuota: 0,
      accrued: 0,
      available: 0,
      consumed,
      customized: 0,
      fromLastYear: 0,
      toNextYear: 0,
      encashed: 0,
    };
  }, [leaves]);

  const exportAll = () => {
    if (!generated) {
      toast.error("Generate the report first");
      return;
    }
    const lines = [
      ["Section", "Metric", "Value"].join(","),
      ["Comp-off", "Approved", compOffStats.approved].join(","),
      ["Comp-off", "Consumed", compOffStats.consumed].join(","),
      ["Comp-off", "Available", compOffStats.available].join(","),
      ["Comp-off", "Expired", compOffStats.expired].join(","),
      ["LOP", "Annual quota", lopStats.annualQuota].join(","),
      ["LOP", "Accrued", lopStats.accrued].join(","),
      ["LOP", "Available", lopStats.available].join(","),
      ["LOP", "Consumed", lopStats.consumed].join(","),
      ["LOP", "Customized", lopStats.customized].join(","),
      ["LOP", "From last year", lopStats.fromLastYear].join(","),
      ["LOP", "To next year", lopStats.toNextYear].join(","),
      ["LOP", "Encashed", lopStats.encashed].join(","),
      "",
      ["Leave Type", "Start", "End", "Days", "Status", "Reason"].join(","),
      ...leaves.map((l) =>
        [l.leave_type, l.start_date, l.end_date, l.days, l.status, (l.reason || "").replace(/,/g, ";")].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-leave-summary-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rangeLabel = `${format(new Date(from), "d MMMM yyyy")} - ${format(new Date(to), "d MMMM yyyy")}`;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={fetchData} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={exportAll}>
          <Download className="mr-1 h-3 w-3" /> Export
        </Button>
      </div>

      {generated && (
        <>
          {/* Top control bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-600 px-4 py-3 text-primary-foreground">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary-foreground hover:bg-white/20"
              onClick={() => shiftYear(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <CalendarRange className="h-4 w-4" /> {rangeLabel}
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-36 bg-white/95 text-foreground"
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-36 bg-white/95 text-foreground"
                />
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary-foreground hover:bg-white/20"
              onClick={() => shiftYear(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Leave category cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <LegendCard
              title="Comp-off"
              centerLabel="Available"
              centerValue={compOffStats.available}
              segments={[
                { value: compOffStats.consumed, color: "hsl(217 91% 60%)" },
                { value: compOffStats.available, color: "hsl(142 71% 45%)" },
                { value: compOffStats.expired, color: "hsl(0 72% 51%)" },
              ]}
              legends={[
                { label: "Approved", value: compOffStats.approved, color: "hsl(199 89% 48%)" },
                { label: "Consumed", value: compOffStats.consumed, color: "hsl(217 91% 60%)" },
                { label: "Available", value: compOffStats.available, color: "hsl(142 71% 45%)" },
                { label: "Expired", value: compOffStats.expired, color: "hsl(0 72% 51%)" },
              ]}
            />
            <LegendCard
              title="LOP"
              centerLabel="Consumed"
              centerValue={lopStats.consumed}
              segments={[
                { value: lopStats.consumed, color: "hsl(0 72% 51%)" },
                { value: lopStats.available, color: "hsl(142 71% 45%)" },
              ]}
              legends={[
                { label: "Annual quota", value: lopStats.annualQuota, color: "hsl(217 91% 60%)" },
                { label: "Accrued", value: lopStats.accrued, color: "hsl(199 89% 48%)" },
                { label: "Available", value: lopStats.available, color: "hsl(142 71% 45%)" },
                { label: "Consumed", value: lopStats.consumed, color: "hsl(0 72% 51%)" },
                { label: "Customized", value: lopStats.customized, color: "hsl(38 92% 50%)" },
                { label: "From last year", value: lopStats.fromLastYear, color: "hsl(262 83% 58%)" },
                { label: "To next year", value: lopStats.toNextYear, color: "hsl(291 64% 42%)" },
                { label: "Encashed", value: lopStats.encashed, color: "hsl(174 62% 40%)" },
              ]}
            />
          </div>

          {/* Applied leaves */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3 text-sm font-semibold">Applied Leaves</div>
              {leaves.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No applied leaves yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Reporting</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.leave_type || "—"}</TableCell>
                        <TableCell>{l.start_date}</TableCell>
                        <TableCell>{l.end_date}</TableCell>
                        <TableCell>{l.days ?? "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{l.reason || "—"}</TableCell>
                        <TableCell>{l.reporting_person || "—"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              (l.status || "") === "approved"
                                ? "default"
                                : (l.status || "") === "rejected"
                                ? "destructive"
                                : "secondary"
                            }
                            className="capitalize"
                          >
                            {l.status || "pending"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
