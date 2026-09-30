import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Save, RotateCcw, FileUp } from "lucide-react";
import { toast } from "sonner";
import { fetchClinicBranding } from "@/lib/clinicBranding";
import {
  OFFER_CONFIG, fillTokens, displayVars, OFFER_BRAND,
  type OfferClause, type LetterVars, type LetterConfig,
} from "@/lib/offerLetterTemplate";
import OfferLetterPreview, { buildOfferLetterHTML } from "./OfferLetterPreview";

export default function OfferLetterGeneratorModal({
  open, onOpenChange, categoryId, employees, cfg = OFFER_CONFIG,
}: { open: boolean; onOpenChange: (o: boolean) => void; categoryId: string; employees: any[]; cfg?: LetterConfig }) {
  const DEFAULT_CLAUSES = cfg.clauses;
  const TOKENS = Object.keys(cfg.defaults);
  const qc = useQueryClient();
  const [clauses, setClauses] = useState<OfferClause[]>(DEFAULT_CLAUSES);
  const [vars, setVars] = useState<LetterVars>(cfg.defaults);
  const [employeeId, setEmployeeId] = useState("");
  const [logo, setLogo] = useState("");
  const [busy, setBusy] = useState(false);
  const focused = useRef<{ i: number; el: HTMLTextAreaElement | null }>({ i: 0, el: null });

  const uniqueStaffValues = (key: "designation" | "department") => {
    const values = new Map<string, string>();
    employees.forEach((employee) => {
      const value = String(employee[key] || "").trim();
      if (value && !values.has(value.toLocaleLowerCase())) values.set(value.toLocaleLowerCase(), value);
    });
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
  };

  const offerFieldOptions: Record<string, string[]> = {
    designation: uniqueStaffValues("designation"),
    department: uniqueStaffValues("department"),
  };

  const normalizeOfferClauses = (items: OfferClause[]) => cfg.kind !== "offer" ? items : items.map((clause) => ({
    ...clause,
    body: clause.body
      .replace(/Your compensation \(CTC \/ monthly package\):/gi, "Your yearly CTC:")
      .replace(/CTC \/ monthly package/gi, "yearly CTC"),
  }));

  useEffect(() => {
    if (!open) return;
    fetchClinicBranding().then((b) => setLogo(b.logo_url));
    supabase.from("offer_letter_templates").select("clauses").eq("template_key", cfg.templateKey).maybeSingle()
      .then(({ data }) => { const c = data?.clauses as any; if (Array.isArray(c) && c.length) setClauses(normalizeOfferClauses(c)); });
  }, [open]);

  const setClause = (i: number, patch: Partial<OfferClause>) =>
    setClauses((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const insertToken = (t: string) => {
    const { i, el } = focused.current;
    const body = clauses[i].body;
    const pos = el?.selectionStart ?? body.length;
    setClause(i, { body: body.slice(0, pos) + `{${t}}` + body.slice(el?.selectionEnd ?? pos) });
  };

  const saveTemplate = async () => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("offer_letter_templates")
      .upsert({ template_key: cfg.templateKey, clauses: clauses as any, updated_by: u.user?.id, updated_at: new Date().toISOString() }, { onConflict: "template_key" });
    error ? toast.error(error.message) : toast.success("Template saved");
  };

  const print = () => {
    const w = window.open("", "_blank", "width=900,height=900");
    if (!w) return toast.error("Allow pop-ups to print");
    w.document.write(buildOfferLetterHTML(clauses, vars, logo, cfg));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  };

  const pickEmployee = (id: string) => {
    setEmployeeId(id);
    const e = employees.find((x) => x.id === id);
    if (e && !vars.candidate_name) setVars((v) => ({ ...v, candidate_name: `${e.first_name} ${e.last_name || ""}`.trim() }));
  };

  const saveToEmployee = async () => {
    setBusy(true);
    try {
      const d = displayVars(vars);
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const W = 210, M = 16; let y = 20;
      pdf.setFont("times", "bold").setFontSize(16).setTextColor(21, 94, 117).text(OFFER_BRAND.name, M, y);
      pdf.setFont("times", "normal").setFontSize(9).setTextColor(91, 100, 114).text(OFFER_BRAND.tagline, M, y + 5);
      pdf.setDrawColor(21, 94, 117).setLineWidth(0.8).line(M, y + 9, W - M, y + 9);
      y += 20;
      pdf.setTextColor(23, 32, 51).setFont("times", "bold").setFontSize(14).text(cfg.title, W / 2, y, { align: "center" });
      y += 7;
      pdf.setFontSize(9).setFont("times", "normal")
        .text(cfg.bar.map((b) => `${b.label}: ${d[b.k] || ""}`).join("  |  "), W / 2, y, { align: "center", maxWidth: W - 2 * M });
      y += 8;
      clauses.forEach((c, i) => {
        const lines = pdf.setFontSize(10.5).splitTextToSize(fillTokens(c.body, vars), W - 2 * M);
        if (y + 8 + lines.length * 5 > 280) { pdf.addPage(); y = 20; }
        pdf.setFont("times", "bold").setFontSize(11).setTextColor(21, 94, 117).text(`${i + 1}. ${c.title}`, M, y);
        pdf.setFont("times", "normal").setFontSize(10.5).setTextColor(23, 32, 51).text(lines, M, y + 5);
        y += 9 + lines.length * 5;
      });
      if (y > 255) { pdf.addPage(); y = 30; }
      y += 18;
      pdf.line(M, y, 85, y); pdf.line(125, y, W - M, y);
      pdf.setFontSize(9).text(cfg.signLeft.replace(/<br\/>.*/, "").replace("&amp;", "&"), M, y + 5).text(cfg.signRight.replace("&amp;", "&"), 125, y + 5);

      const blob = pdf.output("blob");
      const path = `${employeeId}/${cfg.kind}-letter-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("hr-documents").upload(path, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("hr-documents").getPublicUrl(path);
      const { error } = await supabase.from("employee_documents").insert({
        employee_id: employeeId, category_id: categoryId, document_name: `${cfg.docName} - ${d.candidate_name}`,
        file_url: pub.publicUrl, file_path: path, file_size: blob.size, mime_type: "application/pdf",
        issue_date: vars[cfg.issueDateKey] || null,
      } as any);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["employee_documents"] });
      toast.success("Saved to employee documents");
    } catch (e: any) { toast.error(e.message || "Save failed"); }
    finally { setBusy(false); }
  };

  const valid = cfg.fields.filter((f) => f.required).every((f) => (vars[f.k] || "").trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{cfg.kind === "appointment" ? "Appointment Letter" : cfg.kind === "confirmation" ? "Confirmation Letter" : "Offer Letter"}</DialogTitle></DialogHeader>
        <Tabs defaultValue="generate">
          <TabsList><TabsTrigger value="generate">Generate</TabsTrigger><TabsTrigger value="template">Template</TabsTrigger></TabsList>

          <TabsContent value="generate">
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
              <div className="space-y-3">
                <div><Label>Link to employee (for saving)</Label>
                  <Select value={employeeId} onValueChange={pickEmployee}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {cfg.fields.map((f) => (
                  <div key={f.k}><Label>{f.label}</Label>
                    {f.type === "select" ? (
                      <Select value={vars[f.k]} onValueChange={(x) => setVars({ ...vars, [f.k]: x })}>
                        <SelectTrigger><SelectValue placeholder={`Select ${f.label.replace(/\s*\*$/, "").toLowerCase()}`} /></SelectTrigger>
                        <SelectContent>{(cfg.kind === "offer" && offerFieldOptions[f.k] ? offerFieldOptions[f.k] : f.options || []).map((o) => <SelectItem key={o} value={o}>{f.k === "probation_months" ? `${o} month${o === "1" ? "" : "s"}` : o}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input type={f.type || "text"} value={vars[f.k]} onChange={(e) => setVars({ ...vars, [f.k]: e.target.value })} />
                    )}</div>
                ))}
                <div className="flex flex-col gap-2 pt-2">
                  <Button onClick={print} disabled={!valid}><Printer className="h-4 w-4 mr-2" />Print / Save PDF</Button>
                  <Button variant="outline" onClick={saveToEmployee} disabled={!valid || !employeeId || busy}>
                    <FileUp className="h-4 w-4 mr-2" />{busy ? "Saving..." : "Save to Employee Documents"}
                  </Button>
                </div>
              </div>
              <OfferLetterPreview clauses={clauses} vars={vars} logoUrl={logo} cfg={cfg} />
            </div>
          </TabsContent>

          <TabsContent value="template" className="space-y-3">
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground mr-1 self-center">Insert placeholder:</span>
              {TOKENS.map((t) => <Button key={t} size="sm" variant="secondary" className="h-7 text-xs" onClick={() => insertToken(t)}>{`{${t}}`}</Button>)}
            </div>
            {clauses.map((c, i) => (
              <div key={i} className="space-y-1 rounded-md border p-3">
                <Input value={c.title} onChange={(e) => setClause(i, { title: e.target.value })} className="font-semibold" />
                <Textarea rows={4} value={c.body} onFocus={(e) => (focused.current = { i, el: e.currentTarget })}
                  onSelect={(e) => (focused.current = { i, el: e.currentTarget })}
                  onChange={(e) => setClause(i, { body: e.target.value })} />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setClauses(DEFAULT_CLAUSES)}><RotateCcw className="h-4 w-4 mr-2" />Reset to default</Button>
              <Button onClick={saveTemplate}><Save className="h-4 w-4 mr-2" />Save template</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
