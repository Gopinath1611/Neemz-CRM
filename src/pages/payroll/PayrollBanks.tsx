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
import { toast } from "sonner";
import { Plus, Building2, Edit2, Trash2 } from "lucide-react";

const PayrollBanks = () => {
  const [banks, setBanks] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    bank_name: "", account_number: "", ifsc_code: "", branch_name: "",
    account_holder: "", excel_format: "standard", is_active: true,
  });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const { data } = await supabase.from("payroll_banks").select("*").order("created_at", { ascending: false });
    if (data) setBanks(data);
  };

  const handleSave = async () => {
    if (!form.bank_name || !form.account_number) { toast.error("Bank name and account number required"); return; }
    const { error } = editing
      ? await supabase.from("payroll_banks").update(form).eq("id", editing.id)
      : await supabase.from("payroll_banks").insert(form);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Bank updated" : "Bank added");
    setShowForm(false); setEditing(null);
    setForm({ bank_name: "", account_number: "", ifsc_code: "", branch_name: "", account_holder: "", excel_format: "standard", is_active: true });
    fetchAll();
  };

  const handleEdit = (b: any) => { setEditing(b); setForm(b); setShowForm(true); };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this bank?")) return;
    await supabase.from("payroll_banks").delete().eq("id", id);
    toast.success("Deleted");
    fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-7 w-7 text-primary" /> Payroll Bank Accounts</h1>
          <p className="text-muted-foreground mt-1">Bank accounts used for salary transfers</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ bank_name: "", account_number: "", ifsc_code: "", branch_name: "", account_holder: "", excel_format: "standard", is_active: true }); setShowForm(true); }}>
          <Plus size={16} className="mr-1" /> Add Bank
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>IFSC</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Excel Format</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {banks.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.bank_name}</TableCell>
                  <TableCell className="font-mono text-xs">{b.account_number}</TableCell>
                  <TableCell className="font-mono text-xs">{b.ifsc_code}</TableCell>
                  <TableCell>{b.branch_name}</TableCell>
                  <TableCell>{b.account_holder}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{b.excel_format}</Badge></TableCell>
                  <TableCell><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(b)}><Edit2 size={14} /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(b.id)}><Trash2 size={14} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {banks.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No bank accounts. Add one to enable salary transfers.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Bank" : "Add Bank Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div><Label>Bank Name *</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Account Number *</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} /></div>
              <div><Label>IFSC Code</Label><Input value={form.ifsc_code} onChange={e => setForm({ ...form, ifsc_code: e.target.value })} /></div>
              <div><Label>Branch</Label><Input value={form.branch_name} onChange={e => setForm({ ...form, branch_name: e.target.value })} /></div>
              <div><Label>Account Holder</Label><Input value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} /></div>
            </div>
            <div>
              <Label>Excel Format (for transfer file)</Label>
              <Select value={form.excel_format} onValueChange={v => setForm({ ...form, excel_format: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard CSV</SelectItem>
                  <SelectItem value="hdfc">HDFC Format</SelectItem>
                  <SelectItem value="icici">ICICI Format</SelectItem>
                  <SelectItem value="sbi">SBI Format</SelectItem>
                  <SelectItem value="axis">Axis Format</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} className="w-full">{editing ? "Update" : "Add"} Bank</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PayrollBanks;
