import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, FlaskConical, MessageCircle, Printer, Send, Trash2, Plus, Pencil, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
}

interface DiagnosticsStepProps {
  patient: Patient;
  appointmentId?: string | null;
  doctor?: string | null;
  onContinue: () => void;
}

type Category = "scan_center" | "blood_test";

interface DraftOrder {
  id?: string;
  category: Category;
  scan_center: string;
  blood_lab: string;
  tests: string[];
  notes: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  scan_center: "Scan Center",
  blood_test: "Blood Test",
};

const newDraft = (): DraftOrder => ({
  category: "scan_center",
  scan_center: "",
  blood_lab: "",
  tests: [],
  notes: "",
});

export default function DiagnosticsStep({ patient, appointmentId, doctor, onContinue }: DiagnosticsStepProps) {
  const [scanCenters, setScanCenters] = useState<{ id: string; name: string }[]>([]);
  const [bloodLabs, setBloodLabs] = useState<{ id: string; name: string }[]>([]);
  const [scanTests, setScanTests] = useState<{ id: string; name: string; category: string }[]>([]);
  const [bloodTests, setBloodTests] = useState<{ id: string; name: string }[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [draft, setDraft] = useState<DraftOrder>(newDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [editingTest, setEditingTest] = useState<{ id: string; name: string } | null>(null);

  const loadMasters = async () => {
    const [scRes, blRes, stRes, btRes] = await Promise.all([
      supabase.from("scan_centers").select("id, name").eq("is_active", true).order("name"),
      supabase.from("blood_labs").select("id, name").eq("is_active", true).order("name"),
      supabase.from("scan_tests").select("id, name, category").eq("is_active", true).order("name"),
      supabase.from("blood_tests").select("id, name").eq("is_active", true).order("name"),
    ]);
    setScanCenters((scRes.data ?? []) as any);
    setBloodLabs((blRes.data ?? []) as any);
    setScanTests((stRes.data ?? []) as any);
    setBloodTests((btRes.data ?? []) as any);
  };

  const loadOrders = async () => {
    const { data } = await supabase
      .from("diagnostic_orders")
      .select("*")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false });
    setOrders(data ?? []);
  };

  useEffect(() => {
    loadMasters();
    loadOrders();
  }, [patient.id]);

  const availableTests = useMemo(() => {
    const raw = draft.category === "blood_test"
      ? bloodTests.map((t) => ({ id: t.id, name: t.name }))
      : draft.category === "scan_center"
      ? scanTests.map((t) => ({ id: t.id, name: t.name }))
      : [];
    const seen = new Set<string>();
    return raw.filter((t) => {
      const key = t.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [draft.category, scanTests, bloodTests]);

  const alreadyOrderedTests = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.category !== draft.category) return;
      if (editingId && o.id === editingId) return;
      (Array.isArray(o.tests) ? o.tests : []).forEach((n: string) =>
        set.add(String(n).trim().toLowerCase())
      );
    });
    return set;
  }, [orders, draft.category, editingId]);

  const addNewTest = async () => {
    const name = newTestName.trim();
    if (!name) return;
    const table = draft.category === "blood_test" ? "blood_tests" : "scan_tests";
    const payload: any = { name, is_active: true };
    if (table === "scan_tests") payload.category = "general";
    const { error } = await supabase.from(table).insert(payload);
    if (error) {
      toast({ title: "Add failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${draft.category === "blood_test" ? "Blood" : "Scan"} test added` });
    setNewTestName("");
    setDraft((d) => ({ ...d, tests: [...d.tests, name] }));
    loadMasters();
  };

  const updateTest = async () => {
    if (!editingTest) return;
    const name = editingTest.name.trim();
    if (!name) return;
    const table = draft.category === "blood_test" ? "blood_tests" : "scan_tests";
    const { error } = await supabase.from(table).update({ name }).eq("id", editingTest.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Test updated" });
    setEditingTest(null);
    loadMasters();
  };

  const deleteTest = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}" from master list?`)) return;
    const table = draft.category === "blood_test" ? "blood_tests" : "scan_tests";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Test deleted" });
    setDraft((d) => ({ ...d, tests: d.tests.filter((t) => t !== name) }));
    loadMasters();
  };

  const toggleTest = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!draft.tests.includes(name) && alreadyOrderedTests.has(key)) {
      toast({
        title: "Already ordered",
        description: `"${name}" is already in an existing order for this patient.`,
        variant: "destructive",
      });
      return;
    }
    setDraft((d) => ({
      ...d,
      tests: d.tests.includes(name) ? d.tests.filter((t) => t !== name) : [...d.tests, name],
    }));
  };

  const resetDraft = () => {
    setDraft(newDraft());
    setEditingId(null);
  };

  const beginEdit = (o: any) => {
    setEditingId(o.id);
    setDraft({
      id: o.id,
      category: o.category,
      scan_center: o.scan_center || "",
      blood_lab: o.blood_lab || "",
      tests: Array.isArray(o.tests) ? o.tests : [],
      notes: o.notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveOrder = async () => {
    if (draft.tests.length === 0) {
      toast({ title: "Select at least one test", variant: "destructive" });
      return;
    }
    const dupes = draft.tests.filter((n) => alreadyOrderedTests.has(n.trim().toLowerCase()));
    if (dupes.length > 0) {
      toast({
        title: "Duplicate test(s)",
        description: `Already ordered: ${dupes.join(", ")}. Remove them before saving.`,
        variant: "destructive",
      });
      return;
    }
    if (draft.category === "scan_center" && !draft.scan_center) {
      toast({ title: "Select a scan center", variant: "destructive" });
      return;
    }
    if (draft.category === "blood_test" && !draft.blood_lab) {
      toast({ title: "Select a blood lab", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      patient_id: patient.id,
      appointment_id: appointmentId || null,
      category: draft.category,
      scan_center: draft.category === "scan_center" ? draft.scan_center : null,
      blood_lab: draft.category === "blood_test" ? draft.blood_lab : null,
      tests: draft.tests,
      notes: draft.notes || null,
      doctor: doctor || null,
    };
    const { error } = editingId
      ? await supabase.from("diagnostic_orders").update(payload).eq("id", editingId)
      : await supabase.from("diagnostic_orders").insert({ ...payload, status: "ordered" });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "Order updated" : "Diagnostic order saved" });
    resetDraft();
    loadOrders();
  };

  const removeOrder = async (id: string) => {
    if (!confirm("Delete this order?")) return;
    const { error } = await supabase.from("diagnostic_orders").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    loadOrders();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === orders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(orders.map((o) => o.id)));
  };

  const getTargetOrders = () => {
    if (selectedIds.size === 0) return orders;
    return orders.filter((o) => selectedIds.has(o.id));
  };

  const buildMessage = (orderList: any[]) => {
    const patientName = `${patient.first_name} ${patient.last_name}`.trim();
    const lines = [
      `Diagnostic Order — ${patientName}`,
      doctor ? `Referred by: ${doctor}` : "",
      "",
    ];
    orderList.forEach((o, i) => {
      const cat = CATEGORY_LABEL[o.category as Category] || o.category;
      const partner = o.scan_center || o.blood_lab;
      lines.push(`${i + 1}. ${cat}${partner ? ` (${partner})` : ""}`);
      const tests = Array.isArray(o.tests) ? o.tests : [];
      tests.forEach((t: string) => lines.push(`   • ${t}`));
      if (o.notes) lines.push(`   Notes: ${o.notes}`);
    });
    return lines.filter(Boolean).join("\n");
  };

  const sendWhatsApp = async () => {
    const target = getTargetOrders();
    if (target.length === 0) {
      toast({ title: "No orders to send", variant: "destructive" });
      return;
    }
    if (!patient.phone) {
      toast({ title: "Patient phone missing", variant: "destructive" });
      return;
    }
    const safe = (v: unknown) => {
      const s = String(v ?? "").replace(/\s+/g, " ").trim();
      return s || "-";
    };
    const patientName = safe(`${patient.first_name || ""} ${patient.last_name || ""}`.trim() || patient.first_name || "Patient");
    const CLINIC_NAME = "Dr Neemz Dentistry";
    for (const o of target) {
      const categoryLabel = safe(CATEGORY_LABEL[o.category as Category] || o.category);
      const partner = safe(o.blood_lab || o.scan_center);
      const testsList = safe(Array.isArray(o.tests) ? o.tests.filter(Boolean).join(", ") : "");
      const bodyParams = [patientName, categoryLabel, partner, testsList, safe(CLINIC_NAME)];
      const fallbackText = buildMessage([o]);
      console.log("[DiagnosticsStep] sending patient_lab_referral", { bodyParams, phone: patient.phone });
      await sendClinicWhatsApp({
        patient,
        templateKey: "diagnostic_order",
        bodyParams,
        fallbackText,
        label: "Diagnostic order",
      });
    }
  };


  const sendSMS = () => {
    const target = getTargetOrders();
    if (target.length === 0) {
      toast({ title: "No orders to send", variant: "destructive" });
      return;
    }
    const phone = (patient.phone || "").replace(/\D/g, "");
    if (!phone) {
      toast({ title: "Patient phone missing", variant: "destructive" });
      return;
    }
    const text = encodeURIComponent(buildMessage(target));
    window.location.href = `sms:${phone}?body=${text}`;
  };

  const printOrder = async () => {
    const target = getTargetOrders();
    if (target.length === 0) {
      toast({ title: "No orders to print", variant: "destructive" });
      return;
    }
    const patientName = `${patient.first_name} ${patient.last_name}`.trim();
    const { openBrandedPrintWindow } = await import("@/lib/clinicBranding");
    const body = `
      <h2 style="text-align:center;margin:0 0 8px;">Diagnostic Order</h2>
      <div style="font-size:12px;color:#555;margin-bottom:14px;text-align:center;">
        Patient: <b>${patientName}</b>${patient.phone ? ` &nbsp;|&nbsp; ${patient.phone}` : ""}
        ${doctor ? ` &nbsp;|&nbsp; Referred by: <b>${doctor}</b>` : ""}
        &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString()}
      </div>
      ${target.map((o) => {
        const cat = CATEGORY_LABEL[o.category as Category] || o.category;
        const tests = Array.isArray(o.tests) ? o.tests : [];
        return `<div style="margin-bottom:12px;">
          <h3 style="font-size:13px;margin:10px 0 4px;border-bottom:1px solid #ccc;padding-bottom:4px;">${cat}${(o.scan_center || o.blood_lab) ? ` — ${o.scan_center || o.blood_lab}` : ""}</h3>
          <ul style="margin:4px 0 8px 18px;padding:0;font-size:13px;">${tests.map((t: string) => `<li>${t}</li>`).join("")}</ul>
          ${o.notes ? `<div style="font-size:12px;color:#444;">Notes: ${o.notes}</div>` : ""}
        </div>`;
      }).join("")}`;
    await openBrandedPrintWindow({ title: `Diagnostic Order - ${patientName}`, bodyHtml: body });
  };

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical size={18} className="text-primary" /> X-Ray & Blood Test
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* New / Edit order builder */}
        <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
          {editingId && (
            <div className="flex items-center justify-between bg-primary/10 px-3 py-2 rounded">
              <span className="text-sm font-medium">Editing order</span>
              <Button size="sm" variant="ghost" onClick={resetDraft}>
                <X size={14} className="mr-1" /> Cancel
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select
                value={draft.category}
                onValueChange={(v) => setDraft({ ...newDraft(), category: v as Category })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scan_center">Scan Center</SelectItem>
                  <SelectItem value="blood_test">Blood Test</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {draft.category === "scan_center" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Scan Center</Label>
                <Select
                  value={draft.scan_center}
                  onValueChange={(v) => setDraft((d) => ({ ...d, scan_center: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={scanCenters.length ? "Select center" : "Add centers in Settings"} />
                  </SelectTrigger>
                  <SelectContent>
                    {scanCenters.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {draft.category === "blood_test" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Blood Lab</Label>
                <Select
                  value={draft.blood_lab}
                  onValueChange={(v) => setDraft((d) => ({ ...d, blood_lab: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={bloodLabs.length ? "Select lab" : "Add labs in Settings"} />
                  </SelectTrigger>
                  <SelectContent>
                    {bloodLabs.map((c) => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">
              {draft.category === "blood_test" ? "Blood Tests" : "Scan Tests"}
            </Label>

            {/* Add new test inline */}
            <div className="flex gap-2">
              <Input
                value={newTestName}
                onChange={(e) => setNewTestName(e.target.value.replace(/(^|\s)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase()))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewTest(); } }}
                placeholder={`Add new ${draft.category === "blood_test" ? "blood test" : "scan test"}...`}
                className="h-8 text-sm"
              />
              <Button type="button" size="sm" onClick={addNewTest} disabled={!newTestName.trim()}>
                <Plus size={14} className="mr-1" /> Add
              </Button>
            </div>

            {availableTests.length === 0 ? (
              <p className="text-xs text-muted-foreground">No tests yet. Use the field above to add one.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableTests.map((t) => {
                  const isEditing = editingTest?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded border bg-background text-sm group"
                    >
                      {isEditing ? (
                        <>
                          <Input
                            autoFocus
                            value={editingTest!.name}
                            onChange={(e) => setEditingTest({ id: t.id, name: e.target.value.replace(/(^|\s)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase()) })}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); updateTest(); } }}
                            className="h-7 text-sm flex-1"
                          />
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={updateTest}>Save</Button>
                          <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTest(null)}>
                            <X size={12} />
                          </Button>
                        </>
                      ) : (
                        <>
                          {(() => {
                            const isOrdered = alreadyOrderedTests.has(t.name.trim().toLowerCase());
                            const isChecked = draft.tests.includes(t.name);
                            return (
                              <>
                                <Checkbox
                                  checked={isChecked}
                                  disabled={isOrdered && !isChecked}
                                  onCheckedChange={() => toggleTest(t.name)}
                                />
                                <span
                                  className={`truncate flex-1 ${isOrdered && !isChecked ? "text-muted-foreground line-through cursor-not-allowed" : "cursor-pointer"}`}
                                  onClick={() => toggleTest(t.name)}
                                  title={isOrdered && !isChecked ? "Already ordered for this patient" : undefined}
                                >
                                  {t.name}
                                  {isOrdered && !isChecked && (
                                    <span className="ml-1 text-[10px] text-muted-foreground">(ordered)</span>
                                  )}
                                </span>
                              </>
                            );
                          })()}
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded"
                            onClick={() => setEditingTest({ id: t.id, name: t.name })}
                            aria-label="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 text-destructive rounded"
                            onClick={() => deleteTest(t.id, t.name)}
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Clinical indication, urgency, etc."
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={saveOrder} disabled={saving} className="gradient-primary text-primary-foreground">
              <Plus size={14} className="mr-1" /> {editingId ? "Update Order" : "Add Order"}
            </Button>
            <Button variant="outline" onClick={resetDraft}>Reset</Button>
          </div>
        </div>

        {/* Saved orders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold">Orders ({orders.length})</h3>
              {orders.length > 0 && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
                  Select all
                </label>
              )}
              {selectedIds.size > 0 && (
                <Badge variant="secondary">{selectedIds.size} selected</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={sendWhatsApp}>
                <MessageCircle size={14} className="mr-1" /> WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={sendSMS}>
                <Send size={14} className="mr-1" /> SMS
              </Button>
              <Button size="sm" variant="outline" onClick={printOrder}>
                <Printer size={14} className="mr-1" /> Print
              </Button>
            </div>
          </div>
          {selectedIds.size === 0 && orders.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tip: Select specific orders to send only those. If nothing is selected, all orders are sent.
            </p>
          )}
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No diagnostic orders yet.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => {
                const tests = Array.isArray(o.tests) ? o.tests : [];
                const checked = selectedIds.has(o.id);
                return (
                  <div
                    key={o.id}
                    className={`rounded border p-3 bg-card flex items-start gap-3 ${checked ? "ring-2 ring-primary" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelect(o.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">{CATEGORY_LABEL[o.category as Category] || o.category}</Badge>
                        {o.scan_center && <Badge variant="outline">{o.scan_center}</Badge>}
                        {o.blood_lab && <Badge variant="outline">{o.blood_lab}</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm">{tests.join(", ")}</div>
                      {o.notes && <div className="mt-1 text-xs text-muted-foreground">{o.notes}</div>}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="ghost" onClick={() => beginEdit(o)} title="Edit">
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeOrder(o.id)} title="Delete">
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
