import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import { Download, Edit, MoreVertical, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

type LeaveType = {
  id: string;
  name: string;
  display_name: string;
  type: "Paid" | "Unpaid";
  status: "Active" | "Inactive";
};

const LOCAL_KEY = "hrms.settings.leaveTypes";

const DEFAULT_TYPES: LeaveType[] = [
  { id: "comp-off", name: "Comp-off", display_name: "Comp-off", type: "Paid", status: "Active" },
  { id: "lop", name: "LOP", display_name: "LOP", type: "Unpaid", status: "Active" },
];

const readLocal = (): LeaveType[] => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as LeaveType[]) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TYPES;
  } catch {
    return DEFAULT_TYPES;
  }
};

export default function LeaveTypesSettings() {
  const [types, setTypes] = useState<LeaveType[]>(readLocal);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<Omit<LeaveType, "id">>({
    name: "",
    display_name: "",
    type: "Paid",
    status: "Active",
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(types));
    } catch {
      /* ignore quota errors */
    }
  }, [types]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter(
      (t) => t.name.toLowerCase().includes(q) || t.display_name.toLowerCase().includes(q),
    );
  }, [types, search]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", display_name: "", type: "Paid", status: "Active" });
    setOpen(true);
  };

  const openEdit = (t: LeaveType) => {
    setEditing(t);
    setForm({ name: t.name, display_name: t.display_name, type: t.type, status: t.status });
    setOpen(true);
  };

  const handleSave = () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    const display_name = form.display_name.trim() || name;
    if (editing) {
      setTypes((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, ...form, name, display_name } : t)),
      );
      toast.success("Leave type updated");
    } else {
      if (types.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        toast.error("This leave type already exists");
        return;
      }
      setTypes((prev) => [
        ...prev,
        { id: `${Date.now()}`, ...form, name, display_name },
      ]);
      toast.success("Leave type added");
    }
    setOpen(false);
    setEditing(null);
  };

  const handleDelete = (t: LeaveType) => {
    if (!confirm(`Delete leave type "${t.name}"?`)) return;
    setTypes((prev) => prev.filter((x) => x.id !== t.id));
    toast.success("Leave type deleted");
  };

  const handleExport = () => {
    const rows = [
      ["Name", "Display name", "Type", "Status"],
      ...filtered.map((t) => [t.name, t.display_name, t.type, t.status]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "leave-types.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setTypes(DEFAULT_TYPES);
    toast.success("Leave types reset to defaults");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <h2 className="text-lg font-semibold tracking-tight">Leave types</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search for a name of the leave type"
              className="h-9 w-72 pl-8"
            />
          </div>
          <Button className="h-9 gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> ADD NEW
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9" aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" /> Export leave types
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset to defaults
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[90px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.display_name}</TableCell>
                  <TableCell>{t.type}</TableCell>
                  <TableCell>
                    <Badge variant={t.status === "Active" ? "default" : "secondary"} className="font-normal">
                      {t.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(t)} aria-label="Edit leave type">
                        <Edit size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDelete(t)} aria-label="Delete leave type">
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No leave types found
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
            label="leave types"
          />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Leave Type" : "Add New Leave Type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">Name *</Label>
              <Input
                id="lt-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Comp-off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-display">Display name</Label>
              <Input
                id="lt-display"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="Shown to employees"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as LeaveType["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LeaveType["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
