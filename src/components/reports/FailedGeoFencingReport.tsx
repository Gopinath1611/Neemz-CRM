import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, MapIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EMPTY = "—";

const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

type FailedEntry = {
  key: string;
  code: string;
  name: string;
  kind: "Check-in" | "Check-out";
  zoneName: string;
  rule: string;
  dateTime: string;
  lat: number;
  lng: number;
  distance: number;
  zone: Zone;
};

const HEADERS = [
  "Employee id",
  "Employee name",
  "Check-in/Check-out",
  "Geo fence name",
  "Out-of-fence attendance rule",
  "Date and time",
  "Check-in/Check-out lat,lng",
];

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const distanceMeters = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

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
    (department ? usable.find((z) => (z.applicable_departments ?? []).includes(department)) : undefined) ??
    (location ? usable.find((z) => (z.applicable_locations ?? []).includes(location)) : undefined) ??
    null
  );
};

/** Keeps the map framed on the selected fence + attempted pin */
function FitBounds({ entry }: { entry: FailedEntry }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(
      [Number(entry.zone.latitude), Number(entry.zone.longitude)],
      [entry.lat, entry.lng],
    ).pad(0.6);
    map.fitBounds(bounds, { maxZoom: 17 });
  }, [entry, map]);
  return null;
}

export default function FailedGeoFencingReport({
  fromDate,
  toDate,
}: {
  fromDate: string;
  toDate: string;
}) {
  const [entries, setEntries] = useState<FailedEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("attendance_logs")
        .select(
          "id, employee_id, date, check_in_at, check_out_at, check_in_lat, check_in_lng, check_out_lat, check_out_lng",
        )
        .order("date", { ascending: false });
      if (fromDate) q = q.gte("date", fromDate);
      if (toDate) q = q.lte("date", toDate);
      const { data: logs, error } = await q;
      if (error) throw error;

      const [{ data: emps }, { data: zoneRows }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, employee_code, first_name, last_name, department, extra_details"),
        supabase.from("geofence_zones").select("*"),
      ]);

      const empMap = new Map((emps ?? []).map((e: any) => [e.id, e]));
      const zones = (zoneRows ?? []) as Zone[];

      const built: FailedEntry[] = [];
      (logs ?? []).forEach((r: any) => {
        const e: any = empMap.get(r.employee_id);
        const name = e ? `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() : "";
        const zone = resolveZone(
          zones,
          r.employee_id,
          e?.department || "",
          e?.extra_details?.location || "",
        );
        if (!zone || zone.latitude == null || zone.longitude == null) return;

        const push = (
          kind: "Check-in" | "Check-out",
          lat: number | null,
          lng: number | null,
          at: string | null,
        ) => {
          if (lat == null || lng == null) return;
          const dist = distanceMeters(Number(zone.latitude), Number(zone.longitude), lat, lng);
          if (dist <= Number(zone.radius_meters)) return;
          built.push({
            key: `${r.id}-${kind}`,
            code: e?.employee_code || EMPTY,
            name: name || EMPTY,
            kind,
            zoneName: zone.name,
            rule: `Blocked beyond ${zone.radius_meters}m — ${Math.round(dist)}m away`,
            dateTime: at
              ? format(new Date(at), "dd MMM yyyy, hh:mm a")
              : format(parseISO(r.date), "dd MMM yyyy"),
            lat,
            lng,
            distance: dist,
            zone,
          });
        };

        push("Check-in", r.check_in_lat, r.check_in_lng, r.check_in_at);
        push("Check-out", r.check_out_lat, r.check_out_lng, r.check_out_at);
      });

      setEntries(built);
      setSelectedKey(built[0]?.key ?? null);
      toast.success(`Loaded ${built.length} failed attempt(s)`);
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

  const selected = filtered.find((e) => e.key === selectedKey) ?? null;

  const rowsForExport = () =>
    filtered.map((e) => [
      e.code,
      e.name,
      e.kind,
      e.zoneName,
      e.rule,
      e.dateTime,
      `${e.lat.toFixed(6)}, ${e.lng.toFixed(6)}`,
    ]);

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
        w.document.write(`<h3>Failed Geo Fencing Check-in/Check-out Report</h3>${html}`);
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
    a.download = `failed-geo-fencing-report.${kind === "excel" ? "xls" : "csv"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        {/* LEFT — failed attempts table */}
        <div className="rounded-md border bg-background overflow-auto max-h-[520px]">
          <Table>
            <TableHeader>
              <TableRow>
                {HEADERS.map((h) => (
                  <TableHead key={h} className="whitespace-nowrap text-xs">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!entries && (
                <TableRow>
                  <TableCell colSpan={HEADERS.length} className="text-center text-sm text-muted-foreground py-8">
                    Click <strong>Generate Report</strong> to load failed geo-fence attempts
                  </TableCell>
                </TableRow>
              )}
              {entries && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={HEADERS.length} className="text-center text-sm text-muted-foreground py-8">
                    No out-of-fence check-in / check-out attempts for the selected period
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((e) => (
                <TableRow
                  key={e.key}
                  onClick={() => setSelectedKey(e.key)}
                  className={cn(
                    "cursor-pointer",
                    selectedKey === e.key && "bg-primary/10 hover:bg-primary/10",
                  )}
                >
                  <TableCell className="text-xs font-mono whitespace-nowrap">{e.code}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <span className="h-7 w-7 shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
                        {initials(e.name)}
                      </span>
                      <span className="font-medium">{e.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <Badge variant={e.kind === "Check-in" ? "default" : "secondary"} className="text-[10px]">
                      {e.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{e.zoneName}</TableCell>
                  <TableCell className="text-xs">{e.rule}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{e.dateTime}</TableCell>
                  <TableCell className="text-xs font-mono whitespace-nowrap">
                    {e.lat.toFixed(6)}, {e.lng.toFixed(6)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* RIGHT — interactive map */}
        <div className="rounded-md border bg-background min-h-[520px] flex flex-col overflow-hidden">
          {!selected && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <MapIcon className="h-10 w-10" />
              <p className="text-sm">Select a record to view the geo-fence and GPS pin</p>
            </div>
          )}

          {selected && (
            <>
              <div className="flex-1 min-h-[360px]">
                <MapContainer
                  key={selected.key}
                  center={[selected.lat, selected.lng]}
                  zoom={16}
                  scrollWheelZoom
                  className="h-full w-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Circle
                    center={[Number(selected.zone.latitude), Number(selected.zone.longitude)]}
                    radius={Number(selected.zone.radius_meters)}
                    pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.15 }}
                  >
                    <Popup>
                      {selected.zone.name} · {selected.zone.radius_meters}m
                    </Popup>
                  </Circle>
                  <Marker position={[selected.lat, selected.lng]} icon={pinIcon}>
                    <Popup>
                      {selected.kind} attempt · {Math.round(selected.distance)}m outside fence
                    </Popup>
                  </Marker>
                  <FitBounds entry={selected} />
                </MapContainer>
              </div>
              <div className="border-t p-3 space-y-1 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{selected.name} ({selected.code})</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Geo fence</span>
                  <span className="font-medium">{selected.zone.name} · {selected.zone.radius_meters}m</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Attempted {selected.kind.toLowerCase()}</span>
                  <span className="font-medium">{selected.dateTime}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">GPS</span>
                  <span className="font-mono">{selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Distance from fence centre</span>
                  <span className="font-medium">{Math.round(selected.distance)}m</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
