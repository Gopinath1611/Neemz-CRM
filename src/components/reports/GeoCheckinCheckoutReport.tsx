import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, MapIcon, Search, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AttendanceRecord, formatClock } from "@/hooks/useMyAttendance";
import { cn } from "@/lib/utils";

const EMPTY = "—";

type Zone = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  place_address: string | null;
  applicable_departments: string[] | null;
  applicable_locations: string[] | null;
  applicable_employees: string[] | null;
  excluded_employees: string[] | null;
  is_active: boolean;
};

type Entry = {
  key: string;
  employeeId: string;
  code: string;
  name: string;
  title: string;
  shift: string;
  department: string;
  location: string;
  date: string;
  checkIn: string;
  checkOut: string;
  /** actual GPS pins if stored */
  inLat: number | null;
  inLng: number | null;
  outLat: number | null;
  outLng: number | null;
  zone: Zone | null;
};

const HEADERS = [
  "Employee Id", "Employee Name", "Job Title", "Shift", "Date",
  "Check-in", "Check-out", "Latitude", "Longitude", "Source", "Geo Fence", "Radius",
];

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/** Resolve the configured geo-fence for an employee from existing Geo Fencing data */
const resolveZone = (
  zones: Zone[],
  employeeId: string,
  department: string,
  location: string,
): Zone | null => {
  const usable = zones.filter(
    (z) => z.is_active && !(z.excluded_employees ?? []).includes(employeeId),
  );
  return (
    usable.find((z) => (z.applicable_employees ?? []).includes(employeeId)) ??
    (department
      ? usable.find((z) => (z.applicable_departments ?? []).includes(department))
      : undefined) ??
    (location
      ? usable.find((z) => (z.applicable_locations ?? []).includes(location))
      : undefined) ??
    null
  );
};

const osmSrc = (lat: number, lng: number) => {
  const d = 0.004;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
};

export default function GeoCheckinCheckoutReport({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pin, setPin] = useState<"in" | "out">("in");

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("attendance_logs")
        .select(
          "id, employee_id, date, check_in, check_out, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng, worked_seconds, hours_worked, status, late_entry, manual_entry",
        )
        .order("date", { ascending: false });
      if (fromDate) q = q.gte("date", fromDate);
      if (toDate) q = q.lte("date", toDate);
      const { data: logs, error } = await q;
      if (error) throw error;

      const recs = (logs ?? []) as (AttendanceRecord & {
        check_in_lat: number | null; check_in_lng: number | null;
        check_out_lat: number | null; check_out_lng: number | null;
      })[];

      const [{ data: emps }, { data: shifts }, { data: zoneRows }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name, designation, department, extra_details"),
        supabase
          .from("employee_shifts")
          .select("employee_id, shift_name, effective_from")
          .order("effective_from", { ascending: false }),
        supabase.from("geofence_zones").select("*"),
      ]);

      const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      const shiftMap = new Map<string, any>();
      (shifts ?? []).forEach((s: any) => {
        if (!shiftMap.has(s.employee_id)) shiftMap.set(s.employee_id, s);
      });
      const zones = (zoneRows ?? []) as Zone[];

      const built: Entry[] = recs.map((r) => {
        const e: any = empMap.get(r.employee_id);
        const name = e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : "";
        const department = e?.department || "";
        const location = e?.extra_details?.location || "";
        return {
          key: r.id,
          employeeId: r.employee_id,
          code: e?.employee_code || EMPTY,
          name: name || EMPTY,
          title: e?.designation || EMPTY,
          shift: shiftMap.get(r.employee_id)?.shift_name || EMPTY,
          department,
          location,
          date: r.date,
          checkIn: formatClock(r.check_in_at),
          checkOut: formatClock(r.check_out_at),
          inLat: r.check_in_lat,
          inLng: r.check_in_lng,
          outLat: r.check_out_lat,
          outLng: r.check_out_lng,
          zone: resolveZone(zones, r.employee_id, department, location),
        };
      });

      setEntries(built);
      setSelectedKey(null);
      toast.success(`Loaded ${built.length} record(s)`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!entries) return [];
    const t = search.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter(
      (e) => e.name.toLowerCase().includes(t) || e.code.toLowerCase().includes(t),
    );
  }, [entries, search]);

  const selected = entries?.find((e) => e.key === selectedKey) ?? null;

  const hasActualIn = !!(selected?.inLat != null && selected?.inLng != null);
  const hasActualOut = !!(selected?.outLat != null && selected?.outLng != null);
  const activePin = pin === "out" && hasActualOut ? "out" : hasActualIn || hasActualOut ? (hasActualIn ? "in" : "out") : "in";

  const coords = (() => {
    if (!selected) return null;
    if (activePin === "out" && hasActualOut)
      return { lat: selected.outLat!, lng: selected.outLng!, source: "Actual check-out GPS" };
    if (activePin === "in" && hasActualIn)
      return { lat: selected.inLat!, lng: selected.inLng!, source: "Actual check-in GPS" };
    if (hasActualOut)
      return { lat: selected.outLat!, lng: selected.outLng!, source: "Actual check-out GPS" };
    if (selected.zone) {
      const { latitude, longitude } = selected.zone;
      if (latitude == null || longitude == null) return null;
      return { lat: Number(latitude), lng: Number(longitude), source: "Configured geo-fence" };
    }
    return null;
  })();

  const rowsForExport = () =>
    filtered.map((e) => {
      const c =
        e.inLat != null && e.inLng != null
          ? { lat: e.inLat, lng: e.inLng, source: "Actual check-in GPS" }
          : e.outLat != null && e.outLng != null
            ? { lat: e.outLat, lng: e.outLng, source: "Actual check-out GPS" }
            : e.zone
              ? { lat: Number(e.zone.latitude), lng: Number(e.zone.longitude), source: "Configured geo-fence" }
              : null;
      return [
        e.code, e.name, e.title, e.shift, format(parseISO(e.date), "dd MMM yyyy"),
        e.checkIn, e.checkOut,
        c ? String(c.lat) : EMPTY,
        c ? String(c.lng) : EMPTY,
        c ? c.source : EMPTY,
        e.zone?.name || EMPTY,
        e.zone ? `${e.zone.radius_meters}m` : EMPTY,
      ];
    });

  const exportData = (kind: "csv" | "excel" | "pdf") => {
    if (!entries?.length) {
      toast.error("Generate the report first");
      return;
    }
    const body = rowsForExport();
    if (kind === "pdf") {
      const html = `<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:12px">
        <thead><tr>${HEADERS.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(`<h3>Geo Check-in / Check-out Report</h3>${html}`);
        w.document.close();
        w.print();
      }
      return;
    }
    const csv = [HEADERS, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], {
      type: kind === "excel" ? "application/vnd.ms-excel" : "text/csv;charset=utf-8;",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `geo-checkin-checkout-report.${kind === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const detailRow = (label: string, value?: string | null) =>
    value ? (
      <div className="flex justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <Button size="sm" onClick={generate} disabled={loading}>
          {loading ? "Generating…" : "Generate Report"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("csv")}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("excel")}>
          <Download className="h-3 w-3 mr-1" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={() => exportData("pdf")}>
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or ID"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        {/* LEFT — employee list */}
        <div className="rounded-md border bg-background max-h-[460px] overflow-y-auto divide-y">
          {!entries && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Apply filters and click <strong>Generate Report</strong> to load employees
            </p>
          )}
          {entries && filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No attendance records for the selected period
            </p>
          )}
          {filtered.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => { setSelectedKey(e.key); setPin("in"); }}
              className={cn(
                "w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/60 transition-colors",
                selectedKey === e.key && "bg-primary/10 border-l-2 border-l-primary",
              )}
            >
              <span className="h-8 w-8 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                {initials(e.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{e.code}</span>
                  <span className="text-sm font-medium truncate">{e.name}</span>
                </span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {e.title} · {e.shift}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* RIGHT — map */}
        <div className="rounded-md border bg-background min-h-[460px] flex flex-col overflow-hidden">
          {!selected && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MapIcon className="h-10 w-10" />
              <p className="text-sm">Select an employee to view in map</p>
            </div>
          )}

          {selected && !selected.zone && !hasActualIn && !hasActualOut && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MapPin className="h-10 w-10" />
              <p className="text-sm">No geo location assigned</p>
            </div>
          )}

          {selected && !coords && (selected.zone || hasActualIn || hasActualOut) && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MapPin className="h-10 w-10" />
              <p className="text-sm">Location coordinates unavailable</p>
            </div>
          )}

          {selected && coords && (
            <>
              {(hasActualIn || hasActualOut) && (
                <div className="flex gap-2 p-2 border-b">
                  {hasActualIn && (
                    <Button
                      size="sm"
                      variant={activePin === "in" ? "default" : "outline"}
                      onClick={() => setPin("in")}
                    >
                      Check-in location
                    </Button>
                  )}
                  {hasActualOut && (
                    <Button
                      size="sm"
                      variant={activePin === "out" ? "default" : "outline"}
                      onClick={() => setPin("out")}
                    >
                      Check-out location
                    </Button>
                  )}
                </div>
              )}
              <iframe
                title="Employee location map"
                src={osmSrc(coords.lat, coords.lng)}
                className="w-full flex-1 min-h-[280px] border-0"
                loading="lazy"
              />
              <div className="border-t p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{selected.name}</p>
                  <Badge variant="outline" className="text-[10px]">{coords.source}</Badge>
                </div>
                {detailRow("Employee ID", selected.code !== EMPTY ? selected.code : null)}
                {detailRow("Geo Fence", selected.zone?.name)}
                {detailRow("Latitude", String(coords.lat))}
                {detailRow("Longitude", String(coords.lng))}
                {detailRow("Radius", selected.zone ? `${selected.zone.radius_meters}m` : null)}
                {detailRow("Check-in", selected.checkIn !== EMPTY ? selected.checkIn : null)}
                {detailRow("Check-out", selected.checkOut !== EMPTY ? selected.checkOut : null)}
                {detailRow("Location", selected.location || selected.zone?.place_address || null)}
                {detailRow("Date", format(parseISO(selected.date), "dd MMM yyyy"))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
