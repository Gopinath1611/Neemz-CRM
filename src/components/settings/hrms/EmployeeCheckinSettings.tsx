import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Download, Fingerprint, Globe, Lock, MapPin, MoreVertical, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Flags = {
  web: boolean;
  biometric: boolean;
  mobileWeb: boolean;
  geo: boolean;
  restrictDeleteBiometric: boolean;
  restrictDeleteWeb: boolean;
};

type Row = {
  id: string;
  name: string;
  code: string | null;
  flags: Flags;
};

const LOCAL_KEY = "hrms.settings.employeeCheckinFlags";

const DEFAULT_FLAGS: Flags = {
  web: true,
  biometric: false,
  mobileWeb: false,
  geo: true,
  restrictDeleteBiometric: false,
  restrictDeleteWeb: false,
};

const readLocal = (): Record<string, Partial<Flags>> => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "default" : "secondary"} className="font-normal">
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

export default function EmployeeCheckinSettings() {
  const [employees, setEmployees] = useState<{ id: string; name: string; code: string | null }[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Partial<Flags>>>(readLocal);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, employee_code, status")
        .eq("status", "active")
        .order("first_name");
      if (error) {
        toast.error(error.message);
        return;
      }
      setEmployees(
        (data || []).map((e) => ({
          id: e.id,
          name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Unnamed",
          code: e.employee_code,
        })),
      );
    })();
  }, []);

  const rows: Row[] = useMemo(
    () =>
      employees.map((e) => ({
        ...e,
        flags: { ...DEFAULT_FLAGS, ...(overrides[e.id] || {}) },
      })),
    [employees, overrides],
  );

  const paged = usePagedSlice(rows, page, pageSize);

  const toggle = (row: Row, key: keyof Flags, message: string) => {
    const next = {
      ...overrides,
      [row.id]: { ...DEFAULT_FLAGS, ...(overrides[row.id] || {}), [key]: !row.flags[key] },
    };
    setOverrides(next);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      toast.success(message);
    } catch {
      toast.error("Could not save setting");
    }
  };

  const handleExport = () => {
    const headers = [
      "Employee name",
      "Employee ID",
      "Web check-in/check-out",
      "Biometric check-in/check-out",
      "Mobile only web check-in/check-out",
      "Geo-fencing check-in/check-out",
      "Restrict delete biometric entries",
      "Restrict delete web entries",
    ];
    const status = (b: boolean) => (b ? "Active" : "Inactive");
    const lines = rows.map((r) =>
      [
        r.name,
        r.code ?? "",
        status(r.flags.web),
        status(r.flags.biometric),
        status(r.flags.mobileWeb),
        status(r.flags.geo),
        r.flags.restrictDeleteBiometric ? "Restricted" : "Allowed",
        r.flags.restrictDeleteWeb ? "Restricted" : "Allowed",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee-checkin-checkout-settings.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <h2 className="text-lg font-semibold tracking-tight">Employee check-in/check-out</h2>
        <Button variant="outline" className="h-9 gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> EXPORT
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[220px]">Employee name</TableHead>
                  <TableHead>Web Check-in/check-out</TableHead>
                  <TableHead>Biometric Check-in/check-out</TableHead>
                  <TableHead>Mobile only web Check-in/check-out</TableHead>
                  <TableHead>Geo-fencing Check-in/check-out</TableHead>
                  <TableHead className="w-[60px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(r.name)}
                        </span>
                        <div>
                          <div className="font-medium">{r.name}</div>
                          {r.code && <div className="text-xs text-muted-foreground">{r.code}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge active={r.flags.web} /></TableCell>
                    <TableCell><StatusBadge active={r.flags.biometric} /></TableCell>
                    <TableCell><StatusBadge active={r.flags.mobileWeb} /></TableCell>
                    <TableCell><StatusBadge active={r.flags.geo} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem onClick={() => toggle(r, "web", "Web check-in updated")}>
                            <Globe className="mr-2 h-4 w-4" />
                            {r.flags.web ? "Deactivate web" : "Activate web"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggle(r, "mobileWeb", "Mobile only web updated")}>
                            <Smartphone className="mr-2 h-4 w-4" />
                            {r.flags.mobileWeb ? "Deactivate mobile only web" : "Activate mobile only web"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggle(r, "geo", "Geo fencing updated")}>
                            <MapPin className="mr-2 h-4 w-4" />
                            {r.flags.geo ? "Deactivate geo fencing" : "Activate geo fencing"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggle(r, "biometric", "Bio-metric updated")}>
                            <Fingerprint className="mr-2 h-4 w-4" />
                            {r.flags.biometric ? "Deactivate bio-metric" : "Activate bio-metric"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggle(r, "restrictDeleteBiometric", "Biometric entry deletion updated")}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {r.flags.restrictDeleteBiometric
                              ? "Allow to delete biometric entries"
                              : "Restrict to delete biometric entries"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggle(r, "restrictDeleteWeb", "Web entry deletion updated")}>
                            <Lock className="mr-2 h-4 w-4" />
                            {r.flags.restrictDeleteWeb
                              ? "Allow to delete web entries"
                              : "Restrict to delete web entries"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={rows.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="employees"
          />
        </CardContent>
      </Card>
    </div>
  );
}
