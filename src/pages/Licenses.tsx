import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, KeyRound, AlertTriangle, CheckCircle2, CalendarClock, Search,
} from "lucide-react";

type License = {
  id: string;
  workspace_name: string;
  vendor: string | null;
  license_type: string | null;
  account_email: string | null;
  seats: number | null;
  cost: number | null;
  currency: string | null;
  purchase_date: string | null;
  license_start_date: string | null;
  expiry_date: string;
  reminder_days: number;
  auto_renew: boolean | null;
  status: string;
  notes: string | null;
};

const emptyForm = {
  workspace_name: "",
  vendor: "",
  license_type: "",
  account_email: "",
  seats: 1,
  cost: 0,
  currency: "INR",
  purchase_date: "",
  license_start_date: "",
  expiry_date: "",
  reminder_days: 15,
  auto_renew: false,
  status: "active",
  notes: "",
};

const getExpiryStatus = (expiry: string, reminderDays: number) => {
  const days = differenceInDays(parseISO(expiry), new Date());
  if (days < 0) return { label: "Expired", color: "destructive", days };
  if (days <= reminderDays) return { label: `${days}d left`, color: "warning", days };
  return { label: `${days}d left`, color: "success", days };
};

export default function Licenses() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<License | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: licenses = [], isLoading } = useQuery({
    queryKey: ["licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses")
        .select("*")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as License[];
    },
  });

  const upsertMut = useMutation({
    mutationFn: async (payload: typeof emptyForm & { id?: string }) => {
      const cleaned: any = {
        ...payload,
        purchase_date: payload.purchase_date || null,
        license_start_date: payload.license_start_date || null,
        seats: Number(payload.seats) || 1,
        cost: Number(payload.cost) || 0,
        reminder_days: Number(payload.reminder_days) || 15,
      };
      if (editing?.id) {
        const { error } = await supabase.from("licenses").update(cleaned).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("licenses").insert(cleaned);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licenses"] });
      qc.invalidateQueries({ queryKey: ["expiring-licenses"] });
      toast.success(editing ? "License updated" : "License added");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message || "Failed to save"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("licenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licenses"] });
      qc.invalidateQueries({ queryKey: ["expiring-licenses"] });
      toast.success("License deleted");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (lic: License) => {
    setEditing(lic);
    setForm({
      workspace_name: lic.workspace_name,
      vendor: lic.vendor || "",
      license_type: lic.license_type || "",
      account_email: lic.account_email || "",
      seats: lic.seats || 1,
      cost: lic.cost || 0,
      currency: lic.currency || "INR",
      purchase_date: lic.purchase_date || "",
      license_start_date: lic.license_start_date || "",
      expiry_date: lic.expiry_date,
      reminder_days: lic.reminder_days,
      auto_renew: !!lic.auto_renew,
      status: lic.status,
      notes: lic.notes || "",
    });
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = licenses.filter(
      (l) =>
        !q ||
        l.workspace_name.toLowerCase().includes(q) ||
        l.vendor?.toLowerCase().includes(q) ||
        l.account_email?.toLowerCase().includes(q),
    );
    // Sort: inactive at bottom; active sorted by days-left ascending (least → top)
    return [...list].sort((a, b) => {
      const aInactive = a.status === "inactive" ? 1 : 0;
      const bInactive = b.status === "inactive" ? 1 : 0;
      if (aInactive !== bInactive) return aInactive - bInactive;
      const aDays = differenceInDays(parseISO(a.expiry_date), new Date());
      const bDays = differenceInDays(parseISO(b.expiry_date), new Date());
      return aDays - bDays;
    });
  }, [licenses, search]);

  const toggleActiveMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("licenses").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licenses"] });
      qc.invalidateQueries({ queryKey: ["expiring-licenses"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to update"),
  });

  const stats = useMemo(() => {
    const total = licenses.length;
    let expiringSoon = 0;
    let expired = 0;
    let totalCost = 0;
    licenses.forEach((l) => {
      const days = differenceInDays(parseISO(l.expiry_date), new Date());
      if (days < 0) expired++;
      else if (days <= l.reminder_days) expiringSoon++;
      totalCost += Number(l.cost || 0);
    });
    return { total, expiringSoon, expired, totalCost };
  }, [licenses]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <KeyRound className="text-primary" /> License & Renewals
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage workspace, software & subscription licenses with auto renewal alerts.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1" size={16} /> Add License
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Licenses</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarClock size={12} /> Expiring Soon
            </p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats.expiringSoon}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle size={12} /> Expired
            </p>
            <p className="text-2xl font-bold mt-1 text-destructive">{stats.expired}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Annual Cost</p>
            <p className="text-2xl font-bold mt-1">₹{stats.totalCost.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">All Licenses</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search workspace, vendor, email"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Vendor / Type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Purchase</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No licenses yet. Click "Add License" to get started.</TableCell></TableRow>
                ) : filtered.map((lic) => {
                  const st = getExpiryStatus(lic.expiry_date, lic.reminder_days);
                  const isActive = lic.status !== "inactive";
                  return (
                    <TableRow key={lic.id} className={!isActive ? "opacity-60" : ""}>
                      <TableCell className="font-medium">{lic.workspace_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{lic.vendor || "-"}</div>
                        <div className="text-xs text-muted-foreground">{lic.license_type || ""}</div>
                      </TableCell>
                      <TableCell className="text-sm">{lic.account_email || "-"}</TableCell>
                      <TableCell className="text-sm">{lic.purchase_date ? format(parseISO(lic.purchase_date), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(lic.expiry_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>
                        <Badge
                          variant={st.color === "destructive" ? "destructive" : "secondary"}
                          className={
                            st.color === "warning" ? "bg-amber-100 text-amber-700 border-amber-300" :
                            st.color === "success" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : ""
                          }
                        >
                          {st.color === "success" && <CheckCircle2 size={12} className="mr-1" />}
                          {st.color === "warning" && <CalendarClock size={12} className="mr-1" />}
                          {st.color === "destructive" && <AlertTriangle size={12} className="mr-1" />}
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">₹{Number(lic.cost || 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Switch
                          checked={isActive}
                          onCheckedChange={(v) =>
                            toggleActiveMut.mutate({ id: lic.id, status: v ? "active" : "inactive" })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(lic)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(lic.id)}><Trash2 size={14} className="text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit License" : "Add New License"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Workspace Name *</Label>
              <Input value={form.workspace_name} onChange={(e) => setForm({ ...form, workspace_name: e.target.value })} placeholder="e.g. Dr Neemz Google Workspace" />
            </div>
            <div>
              <Label>Vendor</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="e.g. Google, Microsoft, Adobe" />
            </div>
            <div>
              <Label>License Type</Label>
              <Input value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })} placeholder="e.g. Business Standard" />
            </div>
            <div>
              <Label>Account Email</Label>
              <Input type="email" value={form.account_email} onChange={(e) => setForm({ ...form, account_email: e.target.value })} placeholder="admin@drneemz.com" />
            </div>
            <div>
              <Label>Seats / Users</Label>
              <Input type="number" min={1} value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
            <div>
              <Label>License Start Date</Label>
              <Input type="date" value={form.license_start_date} onChange={(e) => setForm({ ...form, license_start_date: e.target.value })} />
            </div>
            <div>
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
            </div>
            <div>
              <Label>Reminder Days Before</Label>
              <Input type="number" min={1} value={form.reminder_days} onChange={(e) => setForm({ ...form, reminder_days: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Cost (₹)</Label>
              <Input type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="renewed">Renewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <Switch checked={form.auto_renew} onCheckedChange={(v) => setForm({ ...form, auto_renew: v })} />
              <Label>Auto-Renew Enabled</Label>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Renewal contact, payment method, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!form.workspace_name.trim()) return toast.error("Workspace name required");
                if (!form.expiry_date) return toast.error("Expiry date required");
                upsertMut.mutate(form);
              }}
              disabled={upsertMut.isPending}
            >
              {editing ? "Update" : "Add"} License
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this license?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMut.mutate(deleteId)} className="bg-destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
