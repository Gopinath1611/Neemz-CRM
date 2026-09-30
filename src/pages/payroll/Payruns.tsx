import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Filter, Edit2, Trash2, Download, Send, CheckCircle, X, Calculator, Eye } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import PayrunDetail from "./PayrunDetail";
import { generatePayrunEmployees } from "@/lib/payrollCalculation";
import { usePermissions } from "@/hooks/usePermissions";


const FY_OPTIONS = [
  { value: "2026-2027", label: "Apr 1, 2026 - Mar 31, 2027" },
  { value: "2025-2026", label: "Apr 1, 2025 - Mar 31, 2026" },
  { value: "2024-2025", label: "Apr 1, 2024 - Mar 31, 2025" },
];
const FY_MONTHS = [
  { m: 4, label: "Apr" }, { m: 5, label: "May" }, { m: 6, label: "Jun" },
  { m: 7, label: "Jul" }, { m: 8, label: "Aug" }, { m: 9, label: "Sep" },
  { m: 10, label: "Oct" }, { m: 11, label: "Nov" }, { m: 12, label: "Dec" },
  { m: 1, label: "Jan" }, { m: 2, label: "Feb" }, { m: 3, label: "Mar" },
];

const Payruns = () => {
  const perms = usePermissions("/payroll/payruns");
  const [fy, setFy] = useState("2026-2027");
  const [payruns, setPayruns] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any>(null);
  const [locations, setLocations] = useState<string[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filters, setFilters] = useState({ status: "all", location: "all", band: "all", employment_type: "all" });
  const [form, setForm] = useState({
    name: "", pay_period_month: 4, location: "all", band: "all", employment_type: "all",
  });

  useEffect(() => { fetchAll(); fetchLocations(); }, [fy]);

  const fetchLocations = async () => {
    const { data } = await supabase.from("branches").select("name").eq("is_active", true);
    if (data) setLocations(data.map((b: any) => b.name));
  };

  const fetchAll = async () => {
    const { data } = await supabase.from("payruns").select("*").eq("financial_year", fy).order("pay_period_month");
    if (data) setPayruns(data);
  };

  const fyStartYear = parseInt(fy.split("-")[0]);

  const filtered = payruns.filter(p => {
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (filters.location !== "all" && p.location !== filters.location) return false;
    if (filters.band !== "all" && p.band !== filters.band) return false;
    if (filters.employment_type !== "all" && p.employment_type !== filters.employment_type) return false;
    return true;
  });

  const handleSave = async () => {
    if (!form.name) { toast.error("Enter payrun name"); return; }
    const m = form.pay_period_month;
    const y = m >= 4 ? fyStartYear : fyStartYear + 1;
    const start = startOfMonth(new Date(y, m - 1, 1));
    const end = endOfMonth(start);

    const payload = {
      name: form.name, financial_year: fy,
      pay_period_month: m, pay_period_year: y,
      pay_period_start: format(start, "yyyy-MM-dd"),
      pay_period_end: format(end, "yyyy-MM-dd"),
      location: form.location, band: form.band, employment_type: form.employment_type,
      payrun_type: "regular", status: editing ? editing.status : "draft",
    };

    const { data: saved, error } = editing
      ? await supabase.from("payruns").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("payruns").insert(payload).select().single();
    if (error) { toast.error(error.message); return; }

    // Auto-map active employees + attendance into the payrun
    let calcMsg = "";
    if (saved) {
      try {
        const res = await generatePayrunEmployees(saved);
        calcMsg = ` — ${res.employees} employees mapped`;
      } catch (e: any) {
        toast.error(`Payrun saved, but employee mapping failed: ${e?.message || "unknown error"}`);
      }
    }

    toast.success(`${editing ? "Payrun updated" : "Payrun created"}${calcMsg}`);
    setShowCreate(false); setEditing(null);
    setForm({ name: "", pay_period_month: 4, location: "all", band: "all", employment_type: "all" });
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payrun?")) return;
    await supabase.from("payruns").delete().eq("id", id);
    toast.success("Deleted");
    fetchAll();
  };

  const handleEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name, pay_period_month: p.pay_period_month,
      location: p.location || "all", band: p.band || "all", employment_type: p.employment_type || "all",
    });
    setShowCreate(true);
  };

  const handleProceed = async (p: any) => {
    // Recalculate employees/attendance/pay before locking the payrun
    try {
      const res = await generatePayrunEmployees(p);
      toast.success(`Calculated pay for ${res.employees} employees`);
    } catch (e: any) {
      toast.error(`Calculation failed: ${e?.message || "unknown error"}`);
      return;
    }
    await supabase.from("payruns").update({
      status: "processed",
      proceed_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", p.id);
    toast.success(`Payrun ${p.name} processed. Bank Excel ready to download.`);
    fetchAll();
  };

  const handleDownloadBankExcel = (p: any) => {
    const csv = `Account Holder,Account Number,IFSC,Amount,Reference\nEmployee 1,000123456,SBIN0001234,${p.total_net_pay || 0},${p.name}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${p.name.replace(/\s+/g, "_")}_bank_transfer.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Bank transfer file downloaded");
  };

  const handleGeneratePayslips = async (p: any) => {
    await supabase.from("payruns").update({ status: "completed" }).eq("id", p.id);
    toast.success(`Payslips generated and emailed to all employees for ${p.name}`);
    fetchAll();
  };

  if (viewing) return <PayrunDetail payrun={viewing} onBack={() => setViewing(null)} />;

  return (

    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payruns</h1>
          <p className="text-muted-foreground mt-1">FY {FY_OPTIONS.find(f => f.value === fy)?.label}</p>
        </div>
        <div className="flex gap-2">
          <Select value={fy} onValueChange={setFy}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{FY_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowFilter(true)}><Filter size={16} className="mr-1" /> Filter</Button>
          {perms.canCreate && (
            <Button onClick={() => { setEditing(null); setForm({ name: "", pay_period_month: 4, location: "all", band: "all", employment_type: "all" }); setShowCreate(true); }}>
              <Plus size={16} className="mr-1" /> Add Payrun
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Pay Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Emp Type</TableHead>
                <TableHead>Employees</TableHead>
                <TableHead>CTC</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Benefits</TableHead>
                <TableHead>Reimburs.</TableHead>
                <TableHead>Proceed Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs">{format(new Date(p.pay_period_start), "dd MMM")} - {format(new Date(p.pay_period_end), "dd MMM yyyy")}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "completed" ? "default" : p.status === "processed" ? "secondary" : "outline"} className="capitalize">{p.status}</Badge>
                  </TableCell>
                  <TableCell className="capitalize text-xs">{p.payrun_type}</TableCell>
                  <TableCell className="text-xs">{p.location}</TableCell>
                  <TableCell className="text-xs">{p.band}</TableCell>
                  <TableCell className="text-xs capitalize">{p.employment_type}</TableCell>
                  <TableCell>{p.total_employees || 0}</TableCell>
                  <TableCell>₹{Number(p.total_ctc || 0).toLocaleString()}</TableCell>
                  <TableCell className="font-semibold text-primary">₹{Number(p.total_net_pay || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-destructive">₹{Number(p.total_deductions || 0).toLocaleString()}</TableCell>
                  <TableCell>₹{Number(p.total_tax || 0).toLocaleString()}</TableCell>
                  <TableCell>₹{Number(p.total_benefits || 0).toLocaleString()}</TableCell>
                  <TableCell>₹{Number(p.total_reimbursement || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{p.proceed_date ? format(new Date(p.proceed_date), "dd MMM") : "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(p)} title="View details"><Eye size={14} /></Button>

                      {p.status === "draft" && (
                        <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => handleProceed(p)} title="Proceed"><Calculator size={14} /></Button>
                      )}
                      {p.status === "processed" && (
                        <>
                          <Button size="sm" variant="ghost" className="text-amber-600" onClick={() => handleDownloadBankExcel(p)} title="Download Bank Excel"><Download size={14} /></Button>
                          <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleGeneratePayslips(p)} title="Generate & Email Payslips"><Send size={14} /></Button>
                        </>
                      )}
                      {perms.canEdit && (
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(p)}><Edit2 size={14} /></Button>
                      )}
                      {perms.canDelete && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(p.id)}><Trash2 size={14} /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={16} className="text-center py-8 text-muted-foreground">No payruns yet. Click "Add Payrun" to create one.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Payrun" : "Create Payrun"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label>Add Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Payrun April 2026" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pay Period</Label>
                <Select value={String(form.pay_period_month)} onValueChange={v => setForm({ ...form, pay_period_month: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FY_MONTHS.map(m => {
                      const y = m.m >= 4 ? fyStartYear : fyStartYear + 1;
                      return <SelectItem key={m.m} value={String(m.m)}>{m.label} {y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={form.location} onValueChange={v => setForm({ ...form, location: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Band</Label>
                <Select value={form.band} onValueChange={v => setForm({ ...form, band: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Bands</SelectItem>
                    <SelectItem value="L1">L1</SelectItem>
                    <SelectItem value="L2">L2</SelectItem>
                    <SelectItem value="L3">L3</SelectItem>
                    <SelectItem value="L4">L4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Employment Type</Label>
                <Select value={form.employment_type} onValueChange={v => setForm({ ...form, employment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employment Types</SelectItem>
                    <SelectItem value="permanent">Permanent Employee</SelectItem>
                    <SelectItem value="contract">Contract Employee</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}><X size={14} className="mr-1" /> Close</Button>
              <Button className="flex-1" onClick={handleSave}>{editing ? "Update" : "Create"} Payrun</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter Sheet (right side) */}
      <Sheet open={showFilter} onOpenChange={setShowFilter}>
        <SheetContent>
          <SheetHeader><SheetTitle>Filter Payruns</SheetTitle></SheetHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={v => setFilters({ ...filters, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={filters.location} onValueChange={v => setFilters({ ...filters, location: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Band</Label>
              <Select value={filters.band} onValueChange={v => setFilters({ ...filters, band: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="L1">L1</SelectItem><SelectItem value="L2">L2</SelectItem>
                  <SelectItem value="L3">L3</SelectItem><SelectItem value="L4">L4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employment Type</Label>
              <Select value={filters.employment_type} onValueChange={v => setFilters({ ...filters, employment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setFilters({ status: "all", location: "all", band: "all", employment_type: "all" })}>Reset Filters</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Payruns;
