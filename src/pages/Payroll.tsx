import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Wallet, Plus, Calculator, CheckCircle, Clock, FileText, Mail, Loader2, Printer } from "lucide-react";
import SalarySlipDocument from "@/components/payroll/SalarySlipDocument";
import { fetchClinicBranding, getCachedClinicBranding, type ClinicBranding } from "@/lib/clinicBranding";
import { format } from "date-fns";
import { downloadPayslipPDF, payslipPdfBase64, attendanceBreakdown } from "@/lib/payslipPdf";


const Field = ({ label, value, danger }: { label: string; value: ReactNode; danger?: boolean }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-sm font-semibold ${danger ? "text-destructive" : ""}`}>{value}</div>
  </div>
);

/* Clinic header for the payslip preview — same branding source as the printed slip. */
const SlipBrandingHeader = () => {
  const [branding, setBranding] = useState<ClinicBranding>(getCachedClinicBranding());
  useEffect(() => { fetchClinicBranding().then(setBranding); }, []);
  const contact = [branding.phone, branding.email, branding.website].filter(Boolean).join(" · ");
  /* Payslip header shows the full legal name even though Clinic Settings stores the short name. */
  const displayName = branding.name === "Dr Neemz Dentistry" ? "Dr Neemz Dentistry Pvt Ltd" : branding.name;
  return (
    <div className="flex flex-col items-center gap-1.5 border-b bg-muted/30 px-6 py-5 text-center">
      {branding.logo_url && <img src={branding.logo_url} alt="" className="h-14 w-14 object-contain" />}
      <div className="text-base font-bold tracking-tight">{displayName}</div>
      {branding.address && <div className="text-xs text-muted-foreground">{branding.address}</div>}
      {contact && <div className="text-xs text-muted-foreground">{contact}</div>}
    </div>
  );
};

const Payroll = () => {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({
    employee_id: "", working_days: "26", hra_percent: "10", da_percent: "5",
    other_allowances: "0", pf_percent: "12", esi_percent: "0.75", tax_deduction: "0",
    other_deductions: "0", notes: "",
  });
  const [showPayslip, setShowPayslip] = useState<any>(null);
  const [slipRecord, setSlipRecord] = useState<any>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);


  useEffect(() => { resolveSelf().then(fetchEmployees); }, [isAdmin, user?.id, user?.email]);
  useEffect(() => { fetchPayroll(); }, [selectedMonth, selectedYear, myEmployeeId, isAdmin]);

  // Live sync: any payroll recalculation (payrun regenerate) refreshes this view
  // and the open payslip dialog without a hard refresh.
  useEffect(() => {
    const channel = supabase
      .channel("payroll-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payroll" }, () => {
        fetchPayroll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedMonth, selectedYear, myEmployeeId, isAdmin]);

  const resolveSelf = async () => {
    if (isAdmin || !user) return;
    let { data } = await supabase.from("employees").select("id").eq("user_id", user.id).maybeSingle();
    if (!data && user.email) {
      const r = await supabase.from("employees").select("id").eq("email", user.email).maybeSingle();
      data = r.data;
    }
    setMyEmployeeId(data?.id ?? null);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("id, first_name, last_name, employee_code, base_salary, department, designation").eq("status", "active").order("first_name");
    if (data) setEmployees(data);
  };

  const fetchPayroll = async () => {
    let q = supabase.from("payroll").select("*, employees(first_name, last_name, employee_code, department, designation, email, bank_account_number)").eq("month", selectedMonth).eq("year", selectedYear);
    if (!isAdmin) {
      if (!myEmployeeId) { setPayrollRecords([]); return; }
      q = q.eq("employee_id", myEmployeeId);
    }
    const { data } = await q.order("created_at", { ascending: false });
    if (data) {
      setPayrollRecords(data);
      // Keep an open payslip dialog in sync with the freshly fetched rows
      setShowPayslip((cur: any) => (cur ? data.find((r: any) => r.id === cur.id) ?? cur : cur));
    }
  };

  /** Always read the latest row (post-recalculation) before showing/exporting it. */
  const fetchFreshRecord = async (id: string) => {
    const { data } = await supabase
      .from("payroll")
      .select("*, employees(first_name, last_name, employee_code, department, designation, email, bank_account_number)")
      .eq("id", id)
      .maybeSingle();
    return data;
  };

  const openPayslip = async (p: any) => {
    setShowPayslip(p);
    const fresh = await fetchFreshRecord(p.id);
    if (fresh) setShowPayslip(fresh);
  };

  const calculateAndGenerate = async () => {
    if (!genForm.employee_id) { toast.error("Select an employee"); return; }
    const emp = employees.find((e) => e.id === genForm.employee_id);
    if (!emp) return;

    const baseSalary = emp.base_salary || 0;
    const workingDays = parseInt(genForm.working_days) || 26;

    // Get attendance for the month
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${new Date(selectedYear, selectedMonth, 0).getDate()}`;
    const { data: attendanceData } = await supabase.from("attendance_logs").select("status").eq("employee_id", genForm.employee_id).gte("date", startDate).lte("date", endDate);

    const presentDays = (attendanceData || []).filter((a) => a.status === "present").length;
    const halfDays = (attendanceData || []).filter((a) => a.status === "half_day").length;
    const leaveDays = (attendanceData || []).filter((a) => a.status === "leave" || a.status === "absent").length;
    const effectiveDays = presentDays + halfDays * 0.5;

    const perDaySalary = baseSalary / workingDays;
    const earnedBase = Math.round(perDaySalary * effectiveDays);
    const hra = Math.round(earnedBase * (parseFloat(genForm.hra_percent) / 100));
    const da = Math.round(earnedBase * (parseFloat(genForm.da_percent) / 100));
    const otherAllow = parseFloat(genForm.other_allowances) || 0;
    const gross = earnedBase + hra + da + otherAllow;

    const pf = Math.round(earnedBase * (parseFloat(genForm.pf_percent) / 100));
    const esi = Math.round(gross * (parseFloat(genForm.esi_percent) / 100));
    const tax = parseFloat(genForm.tax_deduction) || 0;
    const otherDed = parseFloat(genForm.other_deductions) || 0;
    const totalDed = pf + esi + tax + otherDed;
    const net = gross - totalDed;

    const { error } = await supabase.from("payroll").upsert({
      employee_id: genForm.employee_id,
      month: selectedMonth,
      year: selectedYear,
      working_days: workingDays,
      present_days: Math.round(effectiveDays),
      leave_days: leaveDays,
      base_salary: earnedBase,
      hra, da,
      other_allowances: otherAllow,
      gross_salary: gross,
      pf_deduction: pf,
      esi_deduction: esi,
      tax_deduction: tax,
      other_deductions: otherDed,
      total_deductions: totalDed,
      net_salary: net,
      payment_status: "pending",
      notes: genForm.notes || null,
    }, { onConflict: "employee_id,month,year" });

    if (error) { toast.error(error.message); return; }
    toast.success(`Payroll generated: Net ₹${Number(net || 0).toLocaleString("en-IN")}`);
    setShowGenerate(false);
    setGenForm({ employee_id: "", working_days: "26", hra_percent: "10", da_percent: "5", other_allowances: "0", pf_percent: "12", esi_percent: "0.75", tax_deduction: "0", other_deductions: "0", notes: "" });
    fetchPayroll();
  };

  const handleBulkGenerate = async () => {
    const existing = new Set(payrollRecords.map((p) => p.employee_id));
    const pending = employees.filter((e) => !existing.has(e.id));
    if (pending.length === 0) { toast.info("All payrolls already generated"); return; }

    for (const emp of pending) {
      setGenForm((f) => ({ ...f, employee_id: emp.id }));
      // Simple generation with defaults
      const baseSalary = emp.base_salary || 0;
      const hra = Math.round(baseSalary * 0.1);
      const da = Math.round(baseSalary * 0.05);
      const gross = baseSalary + hra + da;
      const pf = Math.round(baseSalary * 0.12);
      const esi = Math.round(gross * 0.0075);
      const net = gross - pf - esi;

      await supabase.from("payroll").upsert({
        employee_id: emp.id, month: selectedMonth, year: selectedYear,
        working_days: 26, present_days: 26, leave_days: 0,
        base_salary: baseSalary, hra, da, other_allowances: 0,
        gross_salary: gross, pf_deduction: pf, esi_deduction: esi,
        tax_deduction: 0, other_deductions: 0, total_deductions: pf + esi,
        net_salary: net, payment_status: "pending",
      }, { onConflict: "employee_id,month,year" });
    }
    toast.success(`${pending.length} payrolls generated`);
    fetchPayroll();
  };

  const markPaid = async (id: string) => {
    await supabase.from("payroll").update({ payment_status: "paid", payment_date: format(new Date(), "yyyy-MM-dd") }).eq("id", id);
    toast.success("Marked as paid");
    fetchPayroll();
  };

  const handleDownloadPayslip = async (p: any) => {
    try {
      const fresh = (await fetchFreshRecord(p.id)) ?? p;
      p = fresh;
      downloadPayslipPDF({ ...p, month: p.month ?? selectedMonth, year: p.year ?? selectedYear });
      toast.success("Payslip PDF downloaded");
    } catch (e: any) {
      toast.error(`Could not generate PDF: ${e?.message || "unknown error"}`);
    }
  };

  const handleEmailPayslip = async (p: any) => {
    const email = p.employees?.email;
    if (!email) { toast.error("No registered email on this employee's profile"); return; }
    setEmailingId(p.id);
    try {
      const fresh = (await fetchFreshRecord(p.id)) ?? p;
      p = fresh;
      const record = { ...p, month: p.month ?? selectedMonth, year: p.year ?? selectedYear };
      const { base64, fileName } = payslipPdfBase64(record);
      const { data, error } = await supabase.functions.invoke("send-payslip-email", {
        body: {
          to: email,
          employeeName: `${p.employees?.first_name || ""} ${p.employees?.last_name || ""}`.trim(),
          period: `${months[(record.month || 1) - 1]} ${record.year}`,
          netSalary: p.net_salary || 0,
          fileName,
          pdfBase64: base64,
        },
      });
      if (error) {
        const details = (error as any)?.context ? await (error as any).context.text() : error.message;
        console.error("send-payslip-email failed:", details);
        toast.error(`Email failed: ${details}`);
        return;
      }
      if ((data as any)?.error) { toast.error(`Email failed: ${(data as any).error}`); return; }
      toast.success(`Payslip emailed to ${email}`);
    } catch (e: any) {
      toast.error(`Email failed: ${e?.message || "unknown error"}`);
    } finally {
      setEmailingId(null);
    }
  };

  const totalNet = payrollRecords.reduce((s, p) => s + (p.net_salary || 0), 0);

  const paidCount = payrollRecords.filter((p) => p.payment_status === "paid").length;

  const fmt = (v: any) => Number(v || 0).toLocaleString("en-IN");

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" /> {isAdmin ? "Payroll Management" : "My Payslips"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Generate payslips, calculate salary & track payments" : "View and download your payslips"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBulkGenerate}><Calculator size={16} className="mr-1" /> Bulk Generate</Button>
            <Button onClick={() => setShowGenerate(true)}><Plus size={16} className="mr-1" /> Generate Payroll</Button>
          </div>
        )}
      </div>

      {/* Stats — admin only */}
      {isAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Payroll</p>
            <p className="text-2xl font-bold text-foreground">₹{fmt(totalNet)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Records</p>
            <p className="text-2xl font-bold text-foreground">{payrollRecords.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Paid</p>
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{payrollRecords.length - paidCount}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Month/Year selector */}
      <div className="flex gap-3 items-center">
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net Salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payrollRecords.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{p.employees?.first_name} {p.employees?.last_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.employees?.designation?.replace("_", " ")}</p>
                    </div>
                  </TableCell>
                  <TableCell>{p.present_days}/{p.working_days}</TableCell>
                  <TableCell>₹{(p.base_salary || 0).toLocaleString()}</TableCell>
                  <TableCell>₹{(p.gross_salary || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-destructive">-₹{(p.total_deductions || 0).toLocaleString()}</TableCell>
                  <TableCell className="font-bold text-primary">₹{(p.net_salary || 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={p.payment_status === "paid" ? "default" : "secondary"} className="capitalize">{p.payment_status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openPayslip(p)} title="View payslip"><FileText size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setSlipRecord({ ...p, month: p.month ?? selectedMonth, year: p.year ?? selectedYear })} title="View / Print Slip"><Printer size={14} /></Button>
                      <Button
                        size="sm" variant="ghost" className="text-blue-600"
                        disabled={emailingId === p.id}
                        onClick={() => handleEmailPayslip(p)}
                        title={p.employees?.email ? `Email payslip to ${p.employees.email}` : "No registered email"}
                      >
                        {emailingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                      </Button>
                      {isAdmin && p.payment_status !== "paid" && (
                        <Button size="sm" variant="ghost" className="text-green-600" onClick={() => markPaid(p.id)} title="Mark as paid"><CheckCircle size={14} /></Button>
                      )}
                    </div>

                  </TableCell>
                </TableRow>
              ))}
              {payrollRecords.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payroll records for this month</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Generate Payroll - {months[selectedMonth - 1]} {selectedYear}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Employee *</Label>
              <Select value={genForm.employee_id} onValueChange={(v) => setGenForm({ ...genForm, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} (₹{(e.base_salary || 0).toLocaleString()})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Working Days</Label><Input type="number" value={genForm.working_days} onChange={(e) => setGenForm({ ...genForm, working_days: e.target.value })} /></div>
              <div><Label>HRA %</Label><Input type="number" value={genForm.hra_percent} onChange={(e) => setGenForm({ ...genForm, hra_percent: e.target.value })} /></div>
              <div><Label>DA %</Label><Input type="number" value={genForm.da_percent} onChange={(e) => setGenForm({ ...genForm, da_percent: e.target.value })} /></div>
              <div><Label>Other Allowances ₹</Label><Input type="number" value={genForm.other_allowances} onChange={(e) => setGenForm({ ...genForm, other_allowances: e.target.value })} /></div>
              <div><Label>PF %</Label><Input type="number" value={genForm.pf_percent} onChange={(e) => setGenForm({ ...genForm, pf_percent: e.target.value })} /></div>
              <div><Label>ESI %</Label><Input type="number" value={genForm.esi_percent} onChange={(e) => setGenForm({ ...genForm, esi_percent: e.target.value })} /></div>
              <div><Label>Tax ₹</Label><Input type="number" value={genForm.tax_deduction} onChange={(e) => setGenForm({ ...genForm, tax_deduction: e.target.value })} /></div>
              <div><Label>Other Deductions ₹</Label><Input type="number" value={genForm.other_deductions} onChange={(e) => setGenForm({ ...genForm, other_deductions: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={genForm.notes} onChange={(e) => setGenForm({ ...genForm, notes: e.target.value })} rows={2} /></div>
            <Button onClick={calculateAndGenerate} className="w-full"><Calculator size={16} className="mr-1" /> Calculate & Generate</Button>
          </div>
        </DialogContent>
      </Dialog>

      <SalarySlipDocument record={slipRecord} onClose={() => setSlipRecord(null)} />
      {/* Payslip View Dialog */}
      <Dialog open={!!showPayslip} onOpenChange={(o) => !o && setShowPayslip(null)}>
        <DialogContent className="max-h-[94vh] overflow-y-auto p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Payslip - {months[((showPayslip?.month ?? selectedMonth)) - 1]} {showPayslip?.year ?? selectedYear}</DialogTitle>
          <SlipBrandingHeader />
          {showPayslip && (
            <div className="space-y-5 px-6 pb-6 pt-4">
              <div className="flex items-center justify-between gap-3 border-b pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payslip for the period of</p>
                  <p className="text-base font-bold">{months[((showPayslip?.month ?? selectedMonth)) - 1]} {showPayslip?.year ?? selectedYear}</p>
                </div>
                <Badge variant={showPayslip.payment_status === "paid" ? "default" : "secondary"}>
                  {showPayslip.payment_status === "paid" ? `Paid on ${showPayslip.payment_date ? format(new Date(showPayslip.payment_date), "dd MMM yyyy") : "—"}` : "Payment Pending"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Employee Name" value={`${showPayslip.employees?.first_name || ""} ${showPayslip.employees?.last_name || ""}`.trim() || "-"} />
                <Field label="Designation" value={<span className="capitalize">{showPayslip.employees?.designation?.replace(/_/g, " ") || "-"}</span>} />
              </div>
              {(() => {
                const b = attendanceBreakdown(showPayslip);
                const payable = b.daysWorked + b.paidLeaveDays + b.restDays;
                return (
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Attendance &amp; Pay Basis</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border bg-muted/30 p-4">
                      <Field label="Monthly Base" value={`₹${fmt(b.monthlyBase)}`} />
                      <Field label="Total Calendar Days (N)" value={b.totalDays} />
                      <Field label="Daily Rate" value={`₹${fmt(b.dailyRate)} (Base ÷ ${b.totalDays})`} />
                      <Field label="Days Worked" value={b.daysWorked} />
                      <Field label="Approved Paid Leave (SL/CL)" value={b.paidLeaveDays} />
                      <Field label="Paid Rest Days (Sun/Holiday)" value={b.restDays} />
                      <Field label="LOP Days Deducted" danger={b.lopDays > 0} value={<>{b.lopDays}{b.lopAmount ? ` (₹${fmt(b.lopAmount)})` : ""}</>} />
                      <Field label="Pro-rata" value={`${payable} / ${b.totalDays} calendar days (${b.totalDays > 0 ? Math.round((payable / b.totalDays) * 1000) / 10 : 0}%)`} />
                      {b.openPeriodNote && (
                        <p className="col-span-2 text-xs text-muted-foreground">{b.openPeriodNote}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const b = attendanceBreakdown(showPayslip);
                const monthly = b.monthlyBase || Number(showPayslip.gross_salary || 0);
                const basic = Math.round(monthly * 0.5);
                const hraAmt = Math.round(monthly * 0.2);
                const conveyance = Math.round(monthly * 0.08);
                const medical = Math.round(monthly * 0.05);
                const special = Math.round(monthly - basic - hraAmt - conveyance - medical);
                const totalEarnings = basic + hraAmt + conveyance + medical + special;
                const earnRows: [string, number][] = [
                  ["Basic (50%)", basic], ["HRA (20%)", hraAmt], ["Conveyance (8%)", conveyance],
                  ["Medical (5%)", medical], ["Special (17%)", special],
                ];
                const dedRows: [string, number][] = [
                  [`LOP (${b.lopDays} × ₹${fmt(b.dailyRate)})`, b.lopAmount],
                  ["PF", Number(showPayslip.pf_deduction || 0)],
                  ["ESI", Number(showPayslip.esi_deduction || 0)],
                  ["Tax", Number(showPayslip.tax_deduction || 0)],
                  ["Other", Number(showPayslip.other_deductions || 0)],
                ];
                return (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="border-b pb-2 text-[11px] font-bold uppercase tracking-wider text-green-600">Earnings</p>
                      <div className="mt-2 space-y-1.5 text-sm">
                        {earnRows.map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium tabular-nums">₹{fmt(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-bold">
                        <span>Gross</span><span className="tabular-nums">₹{fmt(totalEarnings)}</span>
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="border-b pb-2 text-[11px] font-bold uppercase tracking-wider text-destructive">Deductions</p>
                      <div className="mt-2 space-y-1.5 text-sm">
                        {dedRows.map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium tabular-nums">₹{fmt(v)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm font-bold">
                        <span>Total</span><span className="tabular-nums">₹{fmt(Number(showPayslip.total_deductions || 0) + Number(b.lopAmount || 0))}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const b = attendanceBreakdown(showPayslip);
                const otherDed =
                  Number(showPayslip.pf_deduction || 0) +
                  Number(showPayslip.esi_deduction || 0) +
                  Number(showPayslip.tax_deduction || 0) +
                  Number(showPayslip.other_deductions || 0);
                // Net Salary is always recomputed live: Monthly Base − (LOP Days × Daily Rate) − other deductions.
                // Never trust a stale stored net from older calculation runs.
                const liveNet = Math.max(0, Math.round((b.monthlyBase - b.lopAmount - otherDed) * 100) / 100);
                return (
                  <div className="rounded-lg bg-primary/5 p-4 text-center ring-1 ring-primary/10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Net Salary</p>
                    <p className="mt-1 text-3xl font-bold text-primary tabular-nums">₹{fmt(liveNet)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Net = Monthly Base ₹{fmt(b.monthlyBase)} − (LOP {b.lopDays} × ₹
                      {fmt(b.dailyRate)} = ₹{fmt(b.lopAmount)})
                      {otherDed > 0 ? ` − Other Deductions ₹${fmt(otherDed)}` : ""} = ₹
                      {fmt(liveNet)}
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payroll;
