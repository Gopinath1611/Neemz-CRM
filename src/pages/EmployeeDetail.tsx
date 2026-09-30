import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Plus, Trash2, Upload, FileText, User, Phone, Briefcase, GraduationCap, BadgeIndianRupee, Receipt, Percent, ShieldCheck, IndianRupee, Wallet, CalendarOff } from "lucide-react";
import { toast } from "sonner";

type Extra = Record<string, any>;

const numberOrZero = (v: any) => (isNaN(parseFloat(v)) ? 0 : parseFloat(v));

const SectionGrid: React.FC<{ children: React.ReactNode; cols?: number }> = ({ children, cols = 3 }) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${cols} gap-4`}>{children}</div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

const VALID_TABS = ["primary","work","education","emergency","documents","compensation","statutory","loans","expenses","incometax","salary","exit"];

const TAB_GROUPS = [
  {
    label: "Personal Info",
    items: [
      { value: "primary", label: "Primary Details", icon: User },
      { value: "emergency", label: "Emergency Contacts", icon: Phone },
      { value: "documents", label: "Documents", icon: FileText },
    ],
  },
  {
    label: "Career & Education",
    items: [
      { value: "work", label: "Work Details", icon: Briefcase },
      { value: "education", label: "Education & Experience", icon: GraduationCap },
    ],
  },
  {
    label: "Financials & Payroll",
    items: [
      { value: "compensation", label: "Compensation", icon: BadgeIndianRupee },
      { value: "salary", label: "Salary Template", icon: Receipt },
      { value: "incometax", label: "Income Tax", icon: Percent },
      { value: "statutory", label: "Statutory", icon: ShieldCheck },
    ],
  },
  {
    label: "Claims & Advances",
    items: [
      { value: "loans", label: "Loans", icon: IndianRupee },
      { value: "expenses", label: "Expenses", icon: Wallet },
    ],
  },
  {
    label: "Offboarding",
    items: [
      { value: "exit", label: "Exit", icon: CalendarOff },
    ],
  },
];


export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emp, setEmp] = useState<any>(null);
  const [extra, setExtra] = useState<Extra>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [docCategories, setDocCategories] = useState<any[]>([]);
  const [uploadCategoryId, setUploadCategoryId] = useState<string>("");
  const initialTab = (location.hash || "").replace("#", "");
  const [activeTab, setActiveTab] = useState<string>(VALID_TABS.includes(initialTab) ? initialTab : "primary");

  useEffect(() => {
    const h = (location.hash || "").replace("#", "");
    if (VALID_TABS.includes(h) && h !== activeTab) setActiveTab(h);
  }, [location.hash]);

  useEffect(() => {
    if (id) localStorage.setItem("last_employee_id", id);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: e }, { data: list }, { data: d }, { data: cats }] = await Promise.all([
        supabase.from("employees").select("*").eq("id", id).maybeSingle(),
        supabase.from("employees").select("id, first_name, last_name, employee_code, designation").eq("status", "active"),
        supabase.from("employee_documents").select("*").eq("employee_id", id).order("created_at", { ascending: false }),
        supabase.from("document_categories").select("id, name").order("name"),
      ]);
      if (!e) {
        toast.error("Employee not found");
        navigate("/employees");
        return;
      }
      setEmp(e);
      setExtra((e as any).extra_details || {});
      setEmployees(list || []);
      setDocs(d || []);
      setDocCategories(cats || []);
      if (cats && cats.length) setUploadCategoryId(cats[0].id);
      setLoading(false);
    })();
  }, [id, navigate]);

  const setX = (path: string, value: any) => {
    setExtra((prev) => ({ ...prev, [path]: value }));
  };
  const setEmpField = (k: string, v: any) => setEmp((prev: any) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!emp) return;
    setSaving(true);
    const { id: _id, created_at, updated_at, ...payload } = emp;
    // Pay Rate (extra_details.pay_rate + pay_schedule) is the single source of truth.
    // Mirror the monthly-normalized figure into base_salary so the Employees list
    // and any legacy readers stay in sync with Compensation Details.
    const rawRate = Number(String(extra?.pay_rate ?? "").replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(rawRate) && rawRate > 0) {
      const sched = String(extra?.pay_schedule || "monthly").toLowerCase().replace(/[\s-]/g, "_");
      const factor = sched === "weekly" ? 52 / 12 : sched === "bi_weekly" ? 26 / 12 : sched === "annually" ? 1 / 12 : 1;
      (payload as any).base_salary = Math.round(rawRate * factor * 100) / 100;
    }
    const { error } = await supabase
      .from("employees")
      .update({ ...payload, extra_details: extra })
      .eq("id", emp.id);

    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Employee saved");
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !emp) return;
    if (!uploadCategoryId) return toast.error("Select a category first");
    const path = `${emp.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("hr-documents").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { error: insErr, data } = await supabase
      .from("employee_documents")
      .insert({
        employee_id: emp.id,
        category_id: uploadCategoryId,
        document_name: file.name,
        mime_type: file.type || "other",
        file_url: path,
        file_path: path,
        file_size: file.size,
      })
      .select()
      .single();
    if (insErr) return toast.error(insErr.message);
    setDocs((prev) => [data, ...prev]);
    toast.success("Document uploaded");
  };

  const removeDoc = async (docId: string, file_url: string) => {
    await supabase.storage.from("hr-documents").remove([file_url]);
    await supabase.from("employee_documents").delete().eq("id", docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  // Generic list helpers for nested arrays
  const listAdd = (key: string, item: any) => setExtra((p) => ({ ...p, [key]: [...(p[key] || []), item] }));
  const listUpdate = (key: string, idx: number, patch: any) =>
    setExtra((p) => ({ ...p, [key]: (p[key] || []).map((x: any, i: number) => (i === idx ? { ...x, ...patch } : x)) }));
  const listRemove = (key: string, idx: number) =>
    setExtra((p) => ({ ...p, [key]: (p[key] || []).filter((_: any, i: number) => i !== idx) }));

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!emp) return null;

  // Salary calculations
  const calcType = extra.calc_type || "monthly";
  const ctc = numberOrZero(extra.annual_ctc);
  const monthlyBase = calcType === "annually" ? ctc / 12 : ctc;
  const basic = monthlyBase * 0.5;
  const hra = monthlyBase * 0.2;
  const conv = monthlyBase * 0.08;
  const medAllowance = monthlyBase * 0.05;
  const specialAllowance = monthlyBase * 0.17;
  const earnings = basic + hra + conv + medAllowance + specialAllowance;
  const reimb =
    numberOrZero(extra.driver_reimb) +
    numberOrZero(extra.vehicle_maint_reimb) +
    numberOrZero(extra.fuel_reimb) +
    numberOrZero(extra.telephone_reimb) +
    numberOrZero(extra.ltr_reimb) +
    numberOrZero(extra.fixed_allowance);
  const totalCalc = earnings + reimb;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/employees"><ArrowLeft size={18} /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{emp.first_name} {emp.last_name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-mono">{emp.employee_code || "No Code"}</Badge>
              <Badge variant={emp.status === "active" ? "default" : "secondary"}>{emp.status}</Badge>
              <span className="text-sm text-muted-foreground capitalize">{emp.designation?.replace(/_/g, " ")}</span>
            </div>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save size={16} className="mr-2" /> {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
        {/* Secondary in-page navigation */}
        <Card className="lg:sticky lg:top-4">
          <CardContent className="p-3 space-y-4">
            {TAB_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                {group.items.map((item) => {
                  const active = activeTab === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => { setActiveTab(item.value); navigate(`#${item.value}`, { replace: true }); }}
                      className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-left transition-colors ${
                        active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" /> <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="min-w-0">
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); navigate(`#${v}`, { replace: true }); }} className="w-full">

        <TabsList className="sr-only">
          <TabsTrigger value="primary">Primary</TabsTrigger>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="education">Education & Experience</TabsTrigger>
          <TabsTrigger value="emergency">Emergency Contacts</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
          <TabsTrigger value="statutory">Statutory</TabsTrigger>
          <TabsTrigger value="loans">Loans</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="incometax">Income Tax</TabsTrigger>
          <TabsTrigger value="salary">Salary Template</TabsTrigger>
          <TabsTrigger value="exit">Exit</TabsTrigger>
        </TabsList>

        {/* PRIMARY */}
        <TabsContent value="primary" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Basic Details</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Employee ID"><Input value={emp.employee_code || ""} onChange={(e) => setEmpField("employee_code", e.target.value)} /></Field>
                <Field label="First Name"><Input value={emp.first_name} onChange={(e) => setEmpField("first_name", e.target.value)} /></Field>
                <Field label="Last Name"><Input value={emp.last_name} onChange={(e) => setEmpField("last_name", e.target.value)} /></Field>
                <Field label="Nickname"><Input value={extra.nickname || ""} onChange={(e) => setX("nickname", e.target.value)} /></Field>
                <Field label="Blood Group">
                  <Select value={extra.blood_group || ""} onValueChange={(v) => setX("blood_group", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Date of Birth"><Input type="date" value={emp.date_of_birth || ""} onChange={(e) => setEmpField("date_of_birth", e.target.value)} /></Field>
                <Field label="Department"><Input value={emp.department || ""} onChange={(e) => setEmpField("department", e.target.value)} /></Field>
                <Field label="Status">
                  <Select value={emp.status} onValueChange={(v) => setEmpField("status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Job Title"><Input value={emp.designation || ""} onChange={(e) => setEmpField("designation", e.target.value)} /></Field>
                <Field label="Role"><Input value={extra.role || ""} onChange={(e) => setX("role", e.target.value)} /></Field>
                <Field label="Commitment">
                  <Select value={emp.employment_type || ""} onValueChange={(v) => setEmpField("employment_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Location"><Input value={extra.location || ""} onChange={(e) => setX("location", e.target.value)} /></Field>
                <Field label="Marital Status">
                  <Select value={extra.marital_status || ""} onValueChange={(v) => setX("marital_status", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Gender">
                  <Select value={emp.gender || ""} onValueChange={(v) => setEmpField("gender", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="ID Proof Type">
                  <Select value={extra.id_proof_type || "aadhar"} onValueChange={(v) => setX("id_proof_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aadhar">Aadhar Card</SelectItem>
                      <SelectItem value="pan">PAN Card</SelectItem>
                      <SelectItem value="voter">Voter ID</SelectItem>
                      <SelectItem value="passport">Passport</SelectItem>
                      <SelectItem value="driving">Driving License</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Aadhar Number"><Input value={emp.aadhar_number || ""} onChange={(e) => setEmpField("aadhar_number", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Contact Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SectionGrid>
                <Field label="Primary Contact"><Input value={emp.phone || ""} onChange={(e) => setEmpField("phone", e.target.value)} /></Field>
                <Field label="Secondary Contact"><Input value={extra.phone_secondary || ""} onChange={(e) => setX("phone_secondary", e.target.value)} /></Field>
                <Field label="Email"><Input type="email" value={emp.email || ""} onChange={(e) => setEmpField("email", e.target.value)} /></Field>
              </SectionGrid>
              <SectionGrid cols={2}>
                <Field label="Home Address"><Textarea rows={3} value={emp.address || ""} onChange={(e) => setEmpField("address", e.target.value)} /></Field>
                <Field label="Communication Address"><Textarea rows={3} value={extra.comm_address || ""} onChange={(e) => setX("comm_address", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Social Media</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="LinkedIn"><Input value={extra.linkedin || ""} onChange={(e) => setX("linkedin", e.target.value)} /></Field>
                <Field label="Facebook"><Input value={extra.facebook || ""} onChange={(e) => setX("facebook", e.target.value)} /></Field>
                <Field label="Instagram"><Input value={extra.instagram || ""} onChange={(e) => setX("instagram", e.target.value)} /></Field>
                <Field label="Twitter / X"><Input value={extra.twitter || ""} onChange={(e) => setX("twitter", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WORK */}
        <TabsContent value="work" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Office Details</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Office Email"><Input value={extra.office_email || ""} onChange={(e) => setX("office_email", e.target.value)} /></Field>
                <Field label="Office Number"><Input value={extra.office_phone || ""} onChange={(e) => setX("office_phone", e.target.value)} /></Field>
                <Field label="Office Extension"><Input value={extra.office_ext || ""} onChange={(e) => setX("office_ext", e.target.value)} /></Field>
                <Field label="Reporting Manager">
                  <Select value={extra.reporting_to || ""} onValueChange={(v) => setX("reporting_to", v)}>
                    <SelectTrigger><SelectValue placeholder="Select Manager" /></SelectTrigger>
                    <SelectContent>
                      {employees.filter((e) => e.id !== emp.id).map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="PO Details"><Input value={extra.po_details || ""} onChange={(e) => setX("po_details", e.target.value)} /></Field>
                <Field label="Join Date"><Input type="date" value={emp.join_date || ""} onChange={(e) => setEmpField("join_date", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Probation & Notice</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Probation Start"><Input type="date" value={extra.probation_start || ""} onChange={(e) => setX("probation_start", e.target.value)} /></Field>
                <Field label="Probation End"><Input type="date" value={extra.probation_end || ""} onChange={(e) => setX("probation_end", e.target.value)} /></Field>
                <Field label="Notice Period (days)"><Input type="number" value={extra.notice_period_days || ""} onChange={(e) => setX("notice_period_days", e.target.value)} /></Field>
                <Field label="Notice Start"><Input type="date" value={extra.notice_start || ""} onChange={(e) => setX("notice_start", e.target.value)} /></Field>
                <Field label="Notice End"><Input type="date" value={extra.notice_end || ""} onChange={(e) => setX("notice_end", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EDUCATION & EXPERIENCE */}
        <TabsContent value="education" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Education</CardTitle>
              <Button size="sm" variant="outline" onClick={() => listAdd("education", { institution: "", degree: "", percentage: "", cgpa: "", completion_date: "", marks: "" })}>
                <Plus size={14} className="mr-1" />Add Education
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(extra.education || []).map((ed: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-3 relative">
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => listRemove("education", i)}><Trash2 size={14} /></Button>
                  <SectionGrid>
                    <Field label="Institution"><Input value={ed.institution} onChange={(e) => listUpdate("education", i, { institution: e.target.value })} /></Field>
                    <Field label="Degree"><Input value={ed.degree} onChange={(e) => listUpdate("education", i, { degree: e.target.value })} /></Field>
                    <Field label="Percentage"><Input value={ed.percentage} onChange={(e) => listUpdate("education", i, { percentage: e.target.value })} /></Field>
                    <Field label="CGPA"><Input value={ed.cgpa} onChange={(e) => listUpdate("education", i, { cgpa: e.target.value })} /></Field>
                    <Field label="Completion Date"><Input type="date" value={ed.completion_date} onChange={(e) => listUpdate("education", i, { completion_date: e.target.value })} /></Field>
                    <Field label="Marks"><Input value={ed.marks} onChange={(e) => listUpdate("education", i, { marks: e.target.value })} /></Field>
                  </SectionGrid>
                </div>
              ))}
              {(!extra.education || extra.education.length === 0) && <p className="text-sm text-muted-foreground">No education added</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Previous Experience</CardTitle>
              <Button size="sm" variant="outline" onClick={() => listAdd("experience", { employer: "", job_title: "", start_date: "", end_date: "", description: "" })}>
                <Plus size={14} className="mr-1" />Add Experience
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(extra.experience || []).map((x: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-3 relative">
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => listRemove("experience", i)}><Trash2 size={14} /></Button>
                  <SectionGrid>
                    <Field label="Employer / Company"><Input value={x.employer} onChange={(e) => listUpdate("experience", i, { employer: e.target.value })} /></Field>
                    <Field label="Job Title"><Input value={x.job_title} onChange={(e) => listUpdate("experience", i, { job_title: e.target.value })} /></Field>
                    <Field label="Start Date"><Input type="date" value={x.start_date} onChange={(e) => listUpdate("experience", i, { start_date: e.target.value })} /></Field>
                    <Field label="End Date"><Input type="date" value={x.end_date} onChange={(e) => listUpdate("experience", i, { end_date: e.target.value })} /></Field>
                  </SectionGrid>
                  <Field label="Job Description"><Textarea rows={2} value={x.description} onChange={(e) => listUpdate("experience", i, { description: e.target.value })} /></Field>
                </div>
              ))}
              {(!extra.experience || extra.experience.length === 0) && <p className="text-sm text-muted-foreground">No experience added</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMERGENCY */}
        <TabsContent value="emergency" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Emergency Contacts</CardTitle>
              <Button size="sm" variant="outline" onClick={() => listAdd("emergency_contacts", { name: "", relationship: "", phone: "", address: "", primary: false })}>
                <Plus size={14} className="mr-1" />Add Contact
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(extra.emergency_contacts || []).map((c: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-3 relative">
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => listRemove("emergency_contacts", i)}><Trash2 size={14} /></Button>
                  <SectionGrid>
                    <Field label="Name"><Input value={c.name} onChange={(e) => listUpdate("emergency_contacts", i, { name: e.target.value })} /></Field>
                    <Field label="Relationship"><Input value={c.relationship} onChange={(e) => listUpdate("emergency_contacts", i, { relationship: e.target.value })} /></Field>
                    <Field label="Phone"><Input value={c.phone} onChange={(e) => listUpdate("emergency_contacts", i, { phone: e.target.value })} /></Field>
                  </SectionGrid>
                  <Field label="Address"><Textarea rows={2} value={c.address} onChange={(e) => listUpdate("emergency_contacts", i, { address: e.target.value })} /></Field>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!c.primary} onCheckedChange={(v) => listUpdate("emergency_contacts", i, { primary: v })} />
                    <Label className="text-sm">Primary Contact</Label>
                  </div>
                </div>
              ))}
              {(!extra.emergency_contacts || extra.emergency_contacts.length === 0) && <p className="text-sm text-muted-foreground">No contacts added</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Documents</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={uploadCategoryId} onValueChange={setUploadCategoryId}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    {docCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <label>
                  <input type="file" className="hidden" onChange={handleDocUpload} />
                  <Button size="sm" variant="outline" asChild><span><Upload size={14} className="mr-1" />Upload</span></Button>
                </label>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border rounded p-2">
                    <div className="flex items-center gap-2"><FileText size={16} /><span className="text-sm">{d.document_name}</span></div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeDoc(d.id, d.file_url)}><Trash2 size={14} /></Button>
                  </div>
                ))}
                {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPENSATION */}
        <TabsContent value="compensation" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Bank Account Details</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Bank Name"><Input value={emp.bank_name || ""} onChange={(e) => setEmpField("bank_name", e.target.value)} /></Field>
                <Field label="Branch"><Input value={extra.bank_branch || ""} onChange={(e) => setX("bank_branch", e.target.value)} /></Field>
                <Field label="IFSC Code"><Input value={emp.bank_ifsc || ""} onChange={(e) => setEmpField("bank_ifsc", e.target.value)} /></Field>
                <Field label="Account Number"><Input value={emp.bank_account_number || ""} onChange={(e) => setEmpField("bank_account_number", e.target.value)} /></Field>
                <Field label="Account Type">
                  <Select value={extra.account_type || "savings"} onValueChange={(v) => setX("account_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="current">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Compensation Details</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const schedule = (extra.pay_schedule || "monthly") as "monthly" | "weekly" | "bi_weekly" | "annually";
                const scheduleLabels: Record<typeof schedule, string> = {
                  monthly: "Monthly",
                  weekly: "Weekly",
                  bi_weekly: "Bi-Weekly",
                  annually: "Annual",
                };
                const placeholders: Record<typeof schedule, string> = {
                  monthly: "e.g. 30000",
                  weekly: "e.g. 7500",
                  bi_weekly: "e.g. 15000",
                  annually: "e.g. 360000",
                };
                return (
                  <SectionGrid>
                    <Field label="Effective From"><Input type="date" value={extra.comp_effective_from || ""} onChange={(e) => setX("comp_effective_from", e.target.value)} /></Field>
                    <Field label={`Pay Rate (${scheduleLabels[schedule]} ₹)`}><Input type="number" placeholder={placeholders[schedule]} value={extra.pay_rate || ""} onChange={(e) => setX("pay_rate", e.target.value)} /></Field>
                    <Field label="Pay Schedule">
                      <Select value={extra.pay_schedule || "monthly"} onValueChange={(v) => setX("pay_schedule", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="bi_weekly">Bi-Weekly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Pay Type">
                      <Select value={extra.pay_type || "salaried"} onValueChange={(v) => setX("pay_type", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="salaried">Salaried</SelectItem>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Overtime Rate"><Input type="number" value={extra.overtime_rate || ""} onChange={(e) => setX("overtime_rate", e.target.value)} /></Field>
                    <Field label="Reason"><Input value={extra.comp_reason || ""} onChange={(e) => setX("comp_reason", e.target.value)} /></Field>
                  </SectionGrid>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* STATUTORY */}
        <TabsContent value="statutory" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Statutory Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SectionGrid>
                <Field label="PAN Number"><Input value={emp.pan_number || ""} onChange={(e) => setEmpField("pan_number", e.target.value)} /></Field>
              </SectionGrid>
              <Separator />
              {[
                { key: "enable_pf", label: "Enable Employee Provident Fund (EPF)?", help: "If enabled, 12% of basic salary is deducted." },
                { key: "enable_esi", label: "Enable Employee State Insurance (ESI)?", help: "Deducted only if employee's monthly salary is ≤ ₹21,000." },
                { key: "enable_pt", label: "Enable Professional Tax?", help: "State-wise applicable." },
                { key: "enable_lwf", label: "Enable Labour Welfare Fund (LWF)?", help: "LWF is deducted if monthly salary is ≤ ₹2,500." },
                { key: "enable_gratuity", label: "Enable Gratuity?", help: "If enabled, 4.81% of basic is adjustable in CTC." },
              ].map((s) => (
                <div key={s.key} className="flex items-start justify-between border rounded p-3">
                  <div>
                    <p className="font-medium text-sm">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.help}</p>
                  </div>
                  <Switch checked={!!extra[s.key]} onCheckedChange={(v) => setX(s.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOANS */}
        <TabsContent value="loans" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Loans</CardTitle>
              <Button size="sm" variant="outline" onClick={() => listAdd("loans", { type: "", amount: "", emi: "", start_date: "", end_date: "", notes: "" })}>
                <Plus size={14} className="mr-1" />Add Loan
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(extra.loans || []).map((l: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-3 relative">
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => listRemove("loans", i)}><Trash2 size={14} /></Button>
                  <SectionGrid>
                    <Field label="Loan Type"><Input value={l.type} onChange={(e) => listUpdate("loans", i, { type: e.target.value })} /></Field>
                    <Field label="Amount"><Input type="number" value={l.amount} onChange={(e) => listUpdate("loans", i, { amount: e.target.value })} /></Field>
                    <Field label="EMI"><Input type="number" value={l.emi} onChange={(e) => listUpdate("loans", i, { emi: e.target.value })} /></Field>
                    <Field label="Start Date"><Input type="date" value={l.start_date} onChange={(e) => listUpdate("loans", i, { start_date: e.target.value })} /></Field>
                    <Field label="End Date"><Input type="date" value={l.end_date} onChange={(e) => listUpdate("loans", i, { end_date: e.target.value })} /></Field>
                  </SectionGrid>
                  <Field label="Notes"><Textarea rows={2} value={l.notes} onChange={(e) => listUpdate("loans", i, { notes: e.target.value })} /></Field>
                </div>
              ))}
              {(!extra.loans || extra.loans.length === 0) && <p className="text-sm text-muted-foreground">No loans added</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Expenses & Reimbursements</CardTitle>
              <Button size="sm" variant="outline" onClick={() => listAdd("emp_expenses", { category: "", amount: "", date: "", notes: "" })}>
                <Plus size={14} className="mr-1" />Add Expense
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {(extra.emp_expenses || []).map((x: any, i: number) => (
                <div key={i} className="border rounded-lg p-3 space-y-3 relative">
                  <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7" onClick={() => listRemove("emp_expenses", i)}><Trash2 size={14} /></Button>
                  <SectionGrid>
                    <Field label="Category"><Input value={x.category} onChange={(e) => listUpdate("emp_expenses", i, { category: e.target.value })} /></Field>
                    <Field label="Amount"><Input type="number" value={x.amount} onChange={(e) => listUpdate("emp_expenses", i, { amount: e.target.value })} /></Field>
                    <Field label="Date of Expense"><Input type="date" value={x.date} onChange={(e) => listUpdate("emp_expenses", i, { date: e.target.value })} /></Field>
                  </SectionGrid>
                  <Field label="Notes"><Textarea rows={2} value={x.notes} onChange={(e) => listUpdate("emp_expenses", i, { notes: e.target.value })} /></Field>
                </div>
              ))}
              {(!extra.emp_expenses || extra.emp_expenses.length === 0) && <p className="text-sm text-muted-foreground">No expenses added</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INCOME TAX */}
        <TabsContent value="incometax" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">IT Declaration</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Declaration Date"><Input type="date" value={extra.it_declaration_date || ""} onChange={(e) => setX("it_declaration_date", e.target.value)} /></Field>
                <Field label="Regime">
                  <Select value={extra.it_regime || "old"} onValueChange={(v) => setX("it_regime", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="old">Old Regime</SelectItem>
                      <SelectItem value="new">New Regime</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="80C"><Input type="number" value={extra.it_80c || ""} onChange={(e) => setX("it_80c", e.target.value)} /></Field>
                <Field label="80D"><Input type="number" value={extra.it_80d || ""} onChange={(e) => setX("it_80d", e.target.value)} /></Field>
                <Field label="HRA Claim"><Input type="number" value={extra.it_hra || ""} onChange={(e) => setX("it_hra", e.target.value)} /></Field>
                <Field label="Other Deductions"><Input type="number" value={extra.it_other || ""} onChange={(e) => setX("it_other", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Proof of Investment</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Proof Submission Date"><Input type="date" value={extra.poi_date || ""} onChange={(e) => setX("poi_date", e.target.value)} /></Field>
                <Field label="Proof Notes"><Textarea rows={3} value={extra.poi_notes || ""} onChange={(e) => setX("poi_notes", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Vehicle Details</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Vehicle Type"><Input value={extra.vehicle_type || ""} onChange={(e) => setX("vehicle_type", e.target.value)} /></Field>
                <Field label="Vehicle Number"><Input value={extra.vehicle_number || ""} onChange={(e) => setX("vehicle_number", e.target.value)} /></Field>
                <Field label="Owner"><Input value={extra.vehicle_owner || ""} onChange={(e) => setX("vehicle_owner", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SALARY TEMPLATE */}
        <TabsContent value="salary" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Salary Template</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Template Name"><Input value={extra.salary_template_name || "Custom Template"} onChange={(e) => setX("salary_template_name", e.target.value)} /></Field>
                <Field label={calcType === "monthly" ? "Monthly CTC" : calcType === "annually" ? "Annual CTC" : "CTC"}><Input type="number" value={extra.annual_ctc || ""} onChange={(e) => setX("annual_ctc", e.target.value)} /></Field>
                <Field label="Calculation Type">
                  <Select value={extra.calc_type || "monthly"} onValueChange={(v) => setX("calc_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                      <SelectItem value="one_time">One-time Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="One-time / Incentive Amount"><Input type="number" value={extra.one_time_amount || ""} onChange={(e) => setX("one_time_amount", e.target.value)} /></Field>
              </SectionGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Earnings (auto-calculated from CTC)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b py-2"><span>Basic (50%)</span><span className="font-medium">₹{basic.toLocaleString()}</span></div>
                <div className="flex justify-between border-b py-2"><span>House Rent Allowance (20%)</span><span className="font-medium">₹{hra.toLocaleString()}</span></div>
                <div className="flex justify-between border-b py-2"><span>Conveyance Allowance (8%)</span><span className="font-medium">₹{conv.toLocaleString()}</span></div>
                <div className="flex justify-between border-b py-2"><span>Fixed Medical Allowance (5%)</span><span className="font-medium">₹{medAllowance.toLocaleString()}</span></div>
                <div className="flex justify-between border-b py-2"><span>Special Allowance (17%)</span><span className="font-medium">₹{specialAllowance.toLocaleString()}</span></div>
                <div className="flex justify-between py-2 font-semibold"><span>Total Earnings</span><span>₹{earnings.toLocaleString()}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Reimbursements</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Driver Reimbursement"><Input type="number" value={extra.driver_reimb || ""} onChange={(e) => setX("driver_reimb", e.target.value)} /></Field>
                <Field label="Vehicle Maintenance Reimbursement"><Input type="number" value={extra.vehicle_maint_reimb || ""} onChange={(e) => setX("vehicle_maint_reimb", e.target.value)} /></Field>
                <Field label="Fuel Reimbursement (FPP)"><Input type="number" value={extra.fuel_reimb || ""} onChange={(e) => setX("fuel_reimb", e.target.value)} /></Field>
                <Field label="Telephone Reimbursement"><Input type="number" value={extra.telephone_reimb || ""} onChange={(e) => setX("telephone_reimb", e.target.value)} /></Field>
                <Field label="Leave Travel Reimbursement (LTR)"><Input type="number" value={extra.ltr_reimb || ""} onChange={(e) => setX("ltr_reimb", e.target.value)} /></Field>
                <Field label="Fixed Allowance"><Input type="number" value={extra.fixed_allowance || ""} onChange={(e) => setX("fixed_allowance", e.target.value)} /></Field>
              </SectionGrid>
              <Separator className="my-4" />
              <div className="flex justify-between font-semibold text-base bg-muted/40 p-3 rounded">
                <span>Overall Total (Earnings + Reimbursements)</span>
                <span className="text-primary">₹{totalCalc.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXIT */}
        <TabsContent value="exit" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Exit Details</CardTitle></CardHeader>
            <CardContent>
              <SectionGrid>
                <Field label="Notice Period Start"><Input type="date" value={extra.exit_notice_start || ""} onChange={(e) => setX("exit_notice_start", e.target.value)} /></Field>
                <Field label="Notice Period End"><Input type="date" value={extra.exit_notice_end || ""} onChange={(e) => setX("exit_notice_end", e.target.value)} /></Field>
                <Field label="Last Working Date"><Input type="date" value={emp.exit_date || ""} onChange={(e) => setEmpField("exit_date", e.target.value)} /></Field>
                <Field label="Approximate Final Settlement Date"><Input type="date" value={extra.exit_settlement_date || ""} onChange={(e) => setX("exit_settlement_date", e.target.value)} /></Field>
                <Field label="Total Arrears Settlement Date"><Input type="date" value={extra.exit_arrears_date || ""} onChange={(e) => setX("exit_arrears_date", e.target.value)} /></Field>
              </SectionGrid>
              <div className="mt-4">
                <Field label="Reason for Exit"><Textarea rows={4} value={extra.exit_reason || ""} onChange={(e) => setX("exit_reason", e.target.value)} /></Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
        </div>
      </div>
    </div>

  );
}
