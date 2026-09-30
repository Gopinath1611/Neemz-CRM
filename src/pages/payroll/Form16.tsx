import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { FileText, HelpCircle, Sparkles, Users, CheckCircle, Send, Inbox, Clock } from "lucide-react";
import { format } from "date-fns";

const FY_OPTIONS = [
  { value: "2026-2027", label: "Apr 1, 2026 - Mar 31, 2027" },
  { value: "2025-2026", label: "Apr 1, 2025 - Mar 31, 2026" },
  { value: "2024-2025", label: "Apr 1, 2024 - Mar 31, 2025" },
];

const Form16 = () => {
  const [fy, setFy] = useState("2026-2027");
  const [forms, setForms] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => { fetchAll(); fetchEmployees(); }, [fy]);

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code, email").eq("status", "active");
    if (data) setEmployees(data);
  };

  const fetchAll = async () => {
    const { data } = await supabase.from("form_16").select("*, employees(first_name, last_name, employee_code, email)").eq("financial_year", fy);
    if (data) setForms(data);
  };

  const handleGenerateAll = async () => {
    const existing = new Set(forms.map(f => f.employee_id));
    const pending = employees.filter(e => !existing.has(e.id));
    if (pending.length === 0) { toast.info("Form 16 already generated for all employees"); return; }

    const inserts = pending.map(e => ({
      employee_id: e.id,
      financial_year: fy,
      status: "created",
      generated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("form_16").insert(inserts);
    if (error) { toast.error(error.message); return; }
    toast.success(`Generated Form 16 for ${pending.length} employees`);
    fetchAll();
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "signed") updates.signed_at = new Date().toISOString();
    if (status === "published") updates.published_at = new Date().toISOString();
    await supabase.from("form_16").update(updates).eq("id", id);
    toast.success(`Marked as ${status}`);
    fetchAll();
  };

  const created = forms.length;
  const signed = forms.filter(f => f.status === "signed" || f.status === "published").length;
  const published = forms.filter(f => f.status === "published").length;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-7 w-7 text-primary" /> Form 16
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowHelp(true)}>
                    <HelpCircle className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>What is Form 16?</TooltipContent>
              </Tooltip>
            </h1>
            <p className="text-muted-foreground mt-1">Total Employees: {employees.length} | FY {FY_OPTIONS.find(f => f.value === fy)?.label}</p>
          </div>
          <div className="flex gap-2">
            <Select value={fy} onValueChange={setFy}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{FY_OPTIONS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => setShowAlert(true)}><Sparkles size={16} className="mr-1" /> Generate Form 16</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <Users className="h-5 w-5 text-blue-600" />
            <p className="text-sm text-muted-foreground mt-2">Total Employees</p>
            <p className="text-2xl font-bold">{employees.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <FileText className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-muted-foreground mt-2">Created</p>
            <p className="text-2xl font-bold text-amber-600">{created}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-sm text-muted-foreground mt-2">Signed</p>
            <p className="text-2xl font-bold text-green-600">{signed}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <Send className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground mt-2">Published</p>
            <p className="text-2xl font-bold text-primary">{published}</p>
          </CardContent></Card>
        </div>

        {/* Forms Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Total Income</TableHead>
                  <TableHead>Total Tax</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map(f => (
                  <TableRow key={f.id}>
                    <TableCell>{f.employees?.first_name} {f.employees?.last_name}</TableCell>
                    <TableCell className="text-xs">{f.employees?.employee_code}</TableCell>
                    <TableCell className="text-xs">{f.employees?.email}</TableCell>
                    <TableCell><Badge variant={f.status === "published" ? "default" : "secondary"} className="capitalize">{f.status}</Badge></TableCell>
                    <TableCell className="text-xs">{f.generated_at ? format(new Date(f.generated_at), "dd MMM yyyy") : "-"}</TableCell>
                    <TableCell>₹{Number(f.total_income || 0).toLocaleString()}</TableCell>
                    <TableCell>₹{Number(f.total_tax || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {f.status === "created" && <Button size="sm" variant="ghost" className="text-green-600" onClick={() => updateStatus(f.id, "signed")}>Sign</Button>}
                        {f.status === "signed" && <Button size="sm" variant="ghost" className="text-primary" onClick={() => updateStatus(f.id, "published")}>Publish</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {forms.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No Form 16 generated yet. Click "Generate Form 16" to start.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Alert Dialog */}
        <Dialog open={showAlert} onOpenChange={setShowAlert}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle className="text-2xl font-normal">Alert!</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              Tax deductor details are required to initiate the Form 16 process. Please update the organisation's bank and tax details in the settings.
            </p>
            <div className="flex justify-end pt-2">
              <Button onClick={() => setShowAlert(false)} className="px-6">OK</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Help Dialog */}
        <Dialog open={showHelp} onOpenChange={setShowHelp}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader><DialogTitle>What is Form 16?</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2 text-sm">
              <div>
                <h4 className="font-semibold mb-1">📄 Form 16</h4>
                <p className="text-muted-foreground">Form 16 is a TDS certificate issued by employers to employees. It contains details of salary paid and tax deducted at source (TDS) during a financial year. Employees use it to file their income tax returns.</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded">
                  <Inbox className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h5 className="font-semibold">Inbox</h5>
                    <p className="text-xs text-muted-foreground">All Form 16 requests, queries, and submissions from employees appear here for HR review.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded">
                  <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h5 className="font-semibold">Time Tracker</h5>
                    <p className="text-xs text-muted-foreground">Detailed log of when each Form 16 was generated, signed, and published — full audit trail.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded">
                  <Users className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <h5 className="font-semibold">Getting Started for Employees</h5>
                    <p className="text-xs text-muted-foreground">Step-by-step support for new employees on accessing, downloading, and using their Form 16 for tax filing.</p>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Form16;
