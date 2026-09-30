import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cake, UserPlus, Building2, CalendarDays, PalmtreeIcon, Award, Home, Rss, LayoutGrid, Megaphone, MessageSquareDot } from "lucide-react";
import HRMSFeeds from "@/components/hrms/HRMSFeeds";

import { format, differenceInYears, addDays, startOfDay, parseISO, isAfter, isBefore, isEqual, startOfMonth, endOfMonth, getMonth, getDate, setYear, getYear } from "date-fns";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
  department: string | null;
  date_of_birth: string | null;
  join_date: string;
  status: string;
}

interface Holiday { id: string; name: string; holiday_date: string; type: string; }
interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}

// Compute upcoming birthday/anniversary date (this year or next)
const nextOccurrence = (mmdd: string, today: Date): Date => {
  const [m, d] = mmdd.split("-").map(Number);
  let y = getYear(today);
  let dt = new Date(y, m - 1, d);
  if (isBefore(dt, startOfDay(today))) dt = new Date(y + 1, m - 1, d);
  return dt;
};

const dayName = (d: Date) => format(d, "EEEE");

const HRMSHome = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"feeds" | "dashboard" | "announcements" | "pending">("feeds");


  useEffect(() => {
    (async () => {
      const [e, h, l] = await Promise.all([
        supabase.from("employees").select("id,first_name,last_name,designation,department,date_of_birth,join_date,status").eq("status", "active"),
        supabase.from("holidays").select("id,name,holiday_date,type").gte("holiday_date", format(new Date(), "yyyy-MM-dd")).order("holiday_date").limit(10),
        supabase.from("leave_requests").select("id,employee_id,leave_type,start_date,end_date,status").eq("status", "approved").lte("start_date", format(addDays(new Date(), 0), "yyyy-MM-dd")).gte("end_date", format(new Date(), "yyyy-MM-dd")),
      ]);
      setEmployees((e.data || []) as Employee[]);
      setHolidays((h.data || []) as Holiday[]);
      setLeaves((l.data || []) as LeaveRequest[]);
      setLoading(false);
    })();
  }, []);

  const today = startOfDay(new Date());
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const last30 = addDays(today, -30);

  // Birthdays
  const birthdayBuckets = useMemo(() => {
    const todayList: Array<Employee & { next: Date; turning: number }> = [];
    const next7: typeof todayList = [];
    const next30: typeof todayList = [];
    employees.forEach((e) => {
      if (!e.date_of_birth) return;
      const dob = parseISO(e.date_of_birth);
      const mmdd = format(dob, "MM-dd");
      const next = nextOccurrence(mmdd, today);
      const turning = getYear(next) - getYear(dob);
      const row = { ...e, next, turning };
      if (getMonth(next) === getMonth(today) && getDate(next) === getDate(today)) todayList.push(row);
      else if (!isAfter(next, in7)) next7.push(row);
      else if (!isAfter(next, in30)) next30.push(row);
    });
    const sortFn = (a: any, b: any) => a.next.getTime() - b.next.getTime();
    return { today: todayList.sort(sortFn), next7: next7.sort(sortFn), next30: next30.sort(sortFn) };
  }, [employees, today]);

  // New joinees (last 30 days)
  const newJoinees = useMemo(() => {
    return employees
      .filter((e) => {
        const jd = parseISO(e.join_date);
        return !isBefore(jd, last30) && !isAfter(jd, today);
      })
      .sort((a, b) => parseISO(b.join_date).getTime() - parseISO(a.join_date).getTime());
  }, [employees]);

  // Department members
  const deptCounts = useMemo(() => {
    const map = new Map<string, number>();
    employees.forEach((e) => {
      const k = (e.department || "unassigned").trim();
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  // People on leave today
  const peopleOnLeave = useMemo(() => {
    const empMap = new Map(employees.map((e) => [e.id, e]));
    const todayStr = format(today, "yyyy-MM-dd");
    return leaves
      .filter((l) => l.start_date <= todayStr && l.end_date >= todayStr)
      .map((l) => ({ ...l, emp: empMap.get(l.employee_id) }))
      .filter((l) => l.emp);
  }, [leaves, employees]);

  // Work anniversaries this month
  const anniversaries = useMemo(() => {
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    return employees
      .filter((e) => e.join_date)
      .map((e) => {
        const jd = parseISO(e.join_date);
        const occThisYear = new Date(getYear(today), getMonth(jd), getDate(jd));
        const years = getYear(occThisYear) - getYear(jd);
        return { ...e, occ: occThisYear, years };
      })
      .filter((e) => e.years >= 1 && !isBefore(e.occ, monthStart) && !isAfter(e.occ, monthEnd))
      .sort((a, b) => a.occ.getTime() - b.occ.getTime());
  }, [employees]);

  const renderPersonRow = (
    name: string,
    designation: string | null | undefined,
    department: string | null | undefined,
    right?: React.ReactNode
  ) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0">
      <div className="min-w-0">
        <p className="font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground capitalize truncate">
          {(designation || "—").replace(/_/g, " ")}
          {department ? ` • ${department.replace(/_/g, " ")}` : ""}
        </p>
      </div>
      {right && <div className="text-right text-xs shrink-0">{right}</div>}
    </div>
  );

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  const tabs = [
    { id: "feeds", label: "Feeds", icon: Rss },
    { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
    { id: "announcements", label: "Announcements", icon: Megaphone },
    { id: "pending", label: "Pending timeline", icon: MessageSquareDot },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Home className="h-7 w-7 text-primary" /> HRMS Home
        </h1>
        <p className="text-muted-foreground mt-1">Birthdays, joinees, holidays, leaves & anniversaries at a glance</p>
      </div>

      {/* Top navigation */}
      <div className="border-t-2 border-t-primary/70 border-b bg-card rounded-t-md">
        <nav className="flex flex-wrap gap-1 px-2">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "feeds" && <HRMSFeeds kind="feeds" />}
      {tab === "announcements" && <HRMSFeeds kind="announcements" />}
      {tab === "pending" && (
        <p className="py-16 text-center text-muted-foreground">No pending posts/comments to display!</p>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${tab === "dashboard" ? "" : "hidden"}`}>

        {/* Birthdays */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-5 w-5 text-pink-500" /> Birthdays
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { title: "Today", list: birthdayBuckets.today, color: "text-pink-600" },
                { title: "Next 7 days", list: birthdayBuckets.next7, color: "text-amber-600" },
                { title: "Next 30 days", list: birthdayBuckets.next30, color: "text-blue-600" },
              ]).map(({ title, list, color }) => (
                <div key={title}>
                  <p className={`text-sm font-semibold mb-2 ${color}`}>{title} ({list.length})</p>
                  {list.length === 0 && <p className="text-xs text-muted-foreground">No birthdays</p>}
                  {list.map((p) => renderPersonRow(
                    `${p.first_name} ${p.last_name}`,
                    p.designation,
                    p.department,
                    <>
                      <p className="font-medium">{format(p.next, "dd MMM")}</p>
                      <p className="text-muted-foreground">{dayName(p.next)} • turns {p.turning}</p>
                    </>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* New Joinees */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-600" /> New Joinees (Last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {newJoinees.length === 0 && <p className="text-sm text-muted-foreground">No new joinees</p>}
            {newJoinees.map((e) => renderPersonRow(
              `${e.first_name} ${e.last_name}`,
              e.designation,
              e.department,
              <>
                <p className="font-medium">{format(parseISO(e.join_date), "dd MMM yyyy")}</p>
                <p className="text-muted-foreground">{dayName(parseISO(e.join_date))}</p>
              </>
            ))}
          </CardContent>
        </Card>

        {/* Department Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" /> Department Members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deptCounts.length === 0 && <p className="text-sm text-muted-foreground">No departments</p>}
            {deptCounts.map(([d, c]) => (
              <div key={d} className="flex items-center justify-between border-b pb-2 last:border-b-0">
                <span className="capitalize">{d.replace(/_/g, " ")}</span>
                <Badge variant="secondary">{c} {c === 1 ? "member" : "members"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Upcoming Holidays */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-amber-600" /> Upcoming Holidays
            </CardTitle>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 && <p className="text-sm text-muted-foreground">No upcoming holidays</p>}
            {holidays.map((h) => {
              const d = parseISO(h.holiday_date);
              return (
                <div key={h.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{h.type.replace(/_/g, " ")}</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-medium">{format(d, "dd MMM yyyy")}</p>
                    <p className="text-muted-foreground">{dayName(d)}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* People on Leave */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PalmtreeIcon className="h-5 w-5 text-cyan-600" /> People on Leave (Today)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {peopleOnLeave.length === 0 && <p className="text-sm text-muted-foreground">Nobody on leave today</p>}
            {peopleOnLeave.map((l) => renderPersonRow(
              `${l.emp!.first_name} ${l.emp!.last_name}`,
              l.emp!.designation,
              l.emp!.department,
              <>
                <p className="font-medium capitalize">{l.leave_type.replace(/_/g, " ")}</p>
                <p className="text-muted-foreground">{format(parseISO(l.start_date), "dd MMM")} – {format(parseISO(l.end_date), "dd MMM")}</p>
              </>
            ))}
          </CardContent>
        </Card>

        {/* Work Anniversaries This Month */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-600" /> Work Anniversaries — {format(today, "MMMM yyyy")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {anniversaries.length === 0 && <p className="text-sm text-muted-foreground">No anniversaries this month</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {anniversaries.map((e) => renderPersonRow(
                `${e.first_name} ${e.last_name}`,
                e.designation,
                e.department,
                <>
                  <p className="font-medium">{e.years} {e.years === 1 ? "year" : "years"}</p>
                  <p className="text-muted-foreground">{format(e.occ, "dd MMM")} • {dayName(e.occ)}</p>
                </>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HRMSHome;
