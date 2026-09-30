import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Edit, Trash2, Search, Plus, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";

type ShiftDef = {
  key: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  source: "db" | "local";
};

const LOCAL_KEY = "hrms.settings.shifts.custom";

const toHHMM = (t: string) => (t || "").slice(0, 5);

const duration = (start: string, end: string) => {
  const [sh, sm] = toHHMM(start).split(":").map(Number);
  const [eh, em] = toHHMM(end).split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return "—";
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
};

const readLocal = (): ShiftDef[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as ShiftDef[]) : [];
  } catch {
    return [];
  }
};

export default function ShiftsSettings() {
  const [dbShifts, setDbShifts] = useState<ShiftDef[]>([]);
  const [localShifts, setLocalShifts] = useState<ShiftDef[]>(readLocal);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftDef | null>(null);
  const [form, setForm] = useState({ shift_name: "", start_time: "09:00", end_time: "18:00" });

  useEffect(() => {
    void fetchShifts();
  }, []);

  const fetchShifts = async () => {
    const { data, error } = await supabase
      .from("employee_shifts")
      .select("shift_name, start_time, end_time")
      .order("shift_name");
    if (error) {
      toast.error(error.message);
      return;
    }
    const map = new Map<string, ShiftDef>();
    (data || []).forEach((r) => {
      const key = `${r.shift_name}|${toHHMM(r.start_time)}|${toHHMM(r.end_time)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          shift_name: r.shift_name,
          start_time: toHHMM(r.start_time),
          end_time: toHHMM(r.end_time),
          source: "db",
        });
      }
    });
    setDbShifts([...map.values()]);
  };

  const persistLocal = (next: ShiftDef[]) => {
    setLocalShifts(next);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch {
      toast.error("Could not save shift locally");
    }
  };

  const allShifts = useMemo(() => {
    const seen = new Set(dbShifts.map((s) => s.key));
    return [...dbShifts, ...localShifts.filter((s) => !seen.has(s.key))];
  }, [dbShifts, localShifts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? allShifts.filter((s) => s.shift_name.toLowerCase().includes(q)) : allShifts;
    return [...list].sort((a, b) => a.shift_name.localeCompare(b.shift_name));
  }, [allShifts, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const openAdd = () => {
    setEditing(null);
    setForm({ shift_name: "", start_time: "09:00", end_time: "18:00" });
    setOpen(true);
  };

  const openEdit = (s: ShiftDef) => {
    setEditing(s);
    setForm({ shift_name: s.shift_name, start_time: s.start_time, end_time: s.end_time });
    setOpen(true);
  };

  const handleSave = async () => {
    const name = form.shift_name.trim();
    if (!name) {
      toast.error("Shift name is required");
      return;
    }
    const key = `${name}|${form.start_time}|${form.end_time}`;

    if (editing && editing.source === "db") {
      const { error } = await supabase
        .from("employee_shifts")
        .update({ shift_name: name, start_time: form.start_time, end_time: form.end_time })
        .eq("shift_name", editing.shift_name)
        .eq("start_time", editing.start_time)
        .eq("end_time", editing.end_time);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Shift updated");
      setOpen(false);
      setEditing(null);
      void fetchShifts();
      return;
    }

    const base = editing ? localShifts.filter((s) => s.key !== editing.key) : localShifts;
    if (base.some((s) => s.key === key) || dbShifts.some((s) => s.key === key)) {
      toast.error("This shift already exists");
      return;
    }
    persistLocal([...base, { key, shift_name: name, start_time: form.start_time, end_time: form.end_time, source: "local" }]);
    toast.success(editing ? "Shift updated" : "Shift added");
    setOpen(false);
    setEditing(null);
  };

  const handleDelete = async (s: ShiftDef) => {
    if (!confirm(`Delete shift "${s.shift_name}"?`)) return;
    if (s.source === "local") {
      persistLocal(localShifts.filter((x) => x.key !== s.key));
      toast.success("Shift deleted");
      return;
    }
    const { error } = await supabase
      .from("employee_shifts")
      .delete()
      .eq("shift_name", s.shift_name)
      .eq("start_time", s.start_time)
      .eq("end_time", s.end_time);
    if (error) toast.error(error.message);
    else {
      toast.success("Shift deleted");
      void fetchShifts();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <h2 className="text-lg font-semibold tracking-tight">Shifts</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search for a shift"
              className="h-9 w-56 pl-8"
            />
          </div>
          <Button className="h-9 gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> ADD NEW
          </Button>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button
              size="icon"
              variant={view === "list" ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => setView("list")}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={view === "grid" ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => setView("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {view === "list" ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift</TableHead>
                  <TableHead>Start time</TableHead>
                  <TableHead>End time</TableHead>
                  <TableHead>Shift duration</TableHead>
                  <TableHead className="w-[90px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="font-medium">{s.shift_name}</TableCell>
                    <TableCell>{s.start_time}</TableCell>
                    <TableCell>{s.end_time}</TableCell>
                    <TableCell>{duration(s.start_time, s.end_time)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="Edit shift">
                          <Edit size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(s)} aria-label="Delete shift">
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No shifts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              label="shifts"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((s) => (
              <Card key={s.key}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{s.shift_name}</p>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="Edit shift">
                        <Edit size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(s)} aria-label="Delete shift">
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {s.start_time} – {s.end_time} · {duration(s.start_time, s.end_time)}
                  </p>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">No shifts found</p>
            )}
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="shifts"
          />
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Shift" : "Add New Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="shift-name">Shift name *</Label>
              <Input
                id="shift-name"
                value={form.shift_name}
                onChange={(e) => setForm({ ...form, shift_name: e.target.value })}
                placeholder="e.g. General"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="shift-start">Start time</Label>
                <Input
                  id="shift-start"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shift-end">End time</Label>
                <Input
                  id="shift-end"
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Duration: {duration(form.start_time, form.end_time)}</p>
            <Button className="w-full" onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
