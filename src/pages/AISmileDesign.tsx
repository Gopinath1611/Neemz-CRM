import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  Smile,
  Camera,
  Upload,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Check,
  X,
  Trash2,
  Plus,
  Send,
  Search,
  Eye,
  Loader2,
  ScanLine,
  ChevronsUpDown,
} from "lucide-react";
import { formatPatientCode } from "@/lib/patientCode";

interface Patient {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  patient_code: number | null;
}

interface Simulation {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  doctor: string | null;
  face_photo_url: string | null;
  smile_photo_url: string | null;
  intraoral_photos: string[];
  occlusal_photos: string[];
  detected_teeth: any[];
  treatment_plan: any[];
  before_image_url: string | null;
  after_image_url: string | null;
  simulation_mode: string;
  status: string;
  patient_feedback: string | null;
  notes: string | null;
  created_at: string;
}

const TREATMENT_TYPES = [
  "Scaling",
  "Root Canal Treatment",
  "Crown Placement",
  "Implant Placement",
  "Bridge Placement",
  "Bleaching",
  "Veneers",
  "Full Mouth Rehabilitation",
];

const SHADES = ["A1", "A2", "A3", "B1", "B2", "BL1", "BL2"];
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  simulated: "bg-blue-500 text-white",
  shared: "bg-purple-500 text-white",
  approved: "bg-green-500 text-white",
  rejected: "bg-red-500 text-white",
};

export default function AISmileDesign() {
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sims, setSims] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [openSim, setOpenSim] = useState<Simulation | null>(null);
  const [creating, setCreating] = useState(false);

  // New simulation form
  const [newPatientId, setNewPatientId] = useState<string>("");
  const [newDoctor, setNewDoctor] = useState("");
  const [patientPopOpen, setPatientPopOpen] = useState(false);
  const [doctorPopOpen, setDoctorPopOpen] = useState(false);
  const { doctorOptions } = useClinicMasters();

  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: pts }, { data: simData }] = await Promise.all([
      supabase.from("patients").select("id, first_name, last_name, phone, patient_code").order("created_at", { ascending: false }).limit(2000),
      supabase.from("smile_simulations").select("*").order("created_at", { ascending: false }),
    ]);
    setPatients((pts as any[]) || []);
    setSims(((simData as any[]) || []).map(normalizeSim));
    setLoading(false);
  };

  const normalizeSim = (s: any): Simulation => ({
    ...s,
    intraoral_photos: Array.isArray(s.intraoral_photos) ? s.intraoral_photos : [],
    occlusal_photos: Array.isArray(s.occlusal_photos) ? s.occlusal_photos : [],
    detected_teeth: Array.isArray(s.detected_teeth) ? s.detected_teeth : [],
    treatment_plan: Array.isArray(s.treatment_plan) ? s.treatment_plan : [],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sims;
    return sims.filter((s) =>
      (s.patient_name || "").toLowerCase().includes(q) ||
      (s.doctor || "").toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q)
    );
  }, [sims, search]);

  const createSimulation = async () => {
    if (!newPatientId) {
      toast({ title: "Select a patient", variant: "destructive" });
      return;
    }
    const p = patients.find((x) => x.id === newPatientId);
    const name = p ? `${p.first_name} ${p.last_name || ""}`.trim() : "";
    const { data, error } = await supabase
      .from("smile_simulations")
      .insert({
        patient_id: newPatientId,
        patient_name: name,
        doctor: newDoctor || null,
        status: "draft",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Simulation created" });
    setSims((prev) => [normalizeSim(data), ...prev]);
    setOpenSim(normalizeSim(data));
    setCreating(false);
    setNewPatientId("");
    setNewDoctor("");
  };

  const refreshSim = async (id: string) => {
    const { data } = await supabase.from("smile_simulations").select("*").eq("id", id).single();
    if (data) {
      const norm = normalizeSim(data);
      setSims((prev) => prev.map((s) => (s.id === id ? norm : s)));
      setOpenSim(norm);
    }
  };

  const deleteSim = async (id: string) => {
    if (!confirm("Delete this simulation?")) return;
    await supabase.from("smile_simulations").delete().eq("id", id);
    setSims((prev) => prev.filter((s) => s.id !== id));
    if (openSim?.id === id) setOpenSim(null);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Sparkles className="text-primary" /> AI Smile Design & Treatment Simulation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload patient photos, detect teeth with AI, design treatment plan and visualize before/after smile.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus size={16} /> New Simulation
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search patient, doctor, status..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge variant="secondary">{filtered.length} simulation(s)</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">All Simulations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Smile className="mx-auto mb-2" />
              <p className="text-sm">No simulations yet. Click "New Simulation" to start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((s) => (
                <Card key={s.id} className="overflow-hidden hover:border-primary cursor-pointer transition" onClick={() => setOpenSim(s)}>
                  <div className="grid grid-cols-2 h-32 bg-muted/40">
                    {s.before_image_url ? <img src={s.before_image_url} className="w-full h-full object-cover" alt="before" /> : <div className="flex items-center justify-center text-muted-foreground"><ImageIcon size={20} /></div>}
                    {s.after_image_url ? <img src={s.after_image_url} className="w-full h-full object-cover" alt="after" /> : <div className="flex items-center justify-center text-muted-foreground"><Wand2 size={20} /></div>}
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.patient_name || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.doctor || "No doctor"}</p>
                      </div>
                      <Badge className={STATUS_COLORS[s.status] || ""}>{s.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {s.treatment_plan.length} treatment(s) · {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Smile Simulation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Patient</Label>
              <Popover open={patientPopOpen} onOpenChange={setPatientPopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {newPatientId
                      ? (() => {
                          const p = patients.find((x) => x.id === newPatientId);
                          return p ? `${formatPatientCode(p.patient_code)} · ${p.first_name} ${p.last_name || ""}${p.phone ? ` · ${p.phone}` : ""}` : "Select patient";
                        })()
                      : "Search by name or mobile..."}
                    <ChevronsUpDown size={14} className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command
                    filter={(value, search) => {
                      // value contains "code | name | phone" lowercased
                      return value.includes(search.toLowerCase()) ? 1 : 0;
                    }}
                  >
                    <CommandInput placeholder="Type name or mobile number..." />
                    <CommandList>
                      <CommandEmpty>No patient found.</CommandEmpty>
                      <CommandGroup>
                        {patients.map((p) => {
                          const label = `${formatPatientCode(p.patient_code)} | ${p.first_name} ${p.last_name || ""} | ${p.phone || ""}`.toLowerCase();
                          return (
                            <CommandItem
                              key={p.id}
                              value={`${label} ${p.id}`}
                              onSelect={() => {
                                setNewPatientId(p.id);
                                setPatientPopOpen(false);
                              }}
                            >
                              <Check size={14} className={cn("mr-2", newPatientId === p.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm">{p.first_name} {p.last_name || ""}</div>
                                <div className="text-xs text-muted-foreground">{formatPatientCode(p.patient_code)} · {p.phone || "no phone"}</div>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Doctor</Label>
              <Popover open={doctorPopOpen} onOpenChange={setDoctorPopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {newDoctor || "Search doctor..."}
                    <ChevronsUpDown size={14} className="opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Type doctor name..." />
                    <CommandList>
                      <CommandEmpty>No doctor found.</CommandEmpty>
                      <CommandGroup>
                        {doctorOptions.map((d) => (
                          <CommandItem
                            key={d.value}
                            value={d.value}
                            onSelect={() => {
                              setNewDoctor(d.value);
                              setDoctorPopOpen(false);
                            }}
                          >
                            <Check size={14} className={cn("mr-2", newDoctor === d.value ? "opacity-100" : "opacity-0")} />
                            {d.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={createSimulation} className="w-full gap-2"><Plus size={14} /> Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail */}
      {openSim && (
        <SimulationDetail
          sim={openSim}
          onClose={() => setOpenSim(null)}
          onChange={() => refreshSim(openSim.id)}
          onDelete={() => deleteSim(openSim.id)}
        />
      )}
    </div>
  );
}

// ----------------- Simulation detail sub-component -----------------

function SimulationDetail({
  sim,
  onClose,
  onChange,
  onDelete,
}: {
  sim: Simulation;
  onClose: () => void;
  onChange: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [plan, setPlan] = useState<any[]>(sim.treatment_plan);
  const [feedback, setFeedback] = useState(sim.patient_feedback || "");
  const [compareSlider, setCompareSlider] = useState([50]);

  useEffect(() => {
    setPlan(sim.treatment_plan);
    setFeedback(sim.patient_feedback || "");
  }, [sim.id]);

  const uploadFile = async (file: File, prefix: string): Promise<string | null> => {
    const path = `${sim.id}/${prefix}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error } = await supabase.storage.from("smile-design").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload error", description: error.message, variant: "destructive" });
      return null;
    }
    const { data } = supabase.storage.from("smile-design").getPublicUrl(path);
    return data.publicUrl;
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>, field: "face_photo_url" | "smile_photo_url" | "intraoral_photos" | "occlusal_photos") => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setBusy(field);
    if (field === "face_photo_url" || field === "smile_photo_url") {
      const url = await uploadFile(files[0], field);
      if (url) {
        const update: any = { [field]: url };
        if (field === "smile_photo_url") update.before_image_url = url;
        await supabase.from("smile_simulations").update(update).eq("id", sim.id);
      }
    } else {
      const existing = sim[field] || [];
      const newUrls: string[] = [];
      for (const f of files) {
        const u = await uploadFile(f, field);
        if (u) newUrls.push(u);
      }
      await supabase.from("smile_simulations").update({ [field]: [...existing, ...newUrls] } as any).eq("id", sim.id);
    }
    setBusy(null);
    onChange();
    e.target.value = "";
  };

  const detectTeeth = async () => {
    const photo = sim.smile_photo_url || sim.intraoral_photos[0] || sim.face_photo_url;
    if (!photo) {
      toast({ title: "Upload a smile/intraoral photo first", variant: "destructive" });
      return;
    }
    setBusy("detect");
    const { data, error } = await supabase.functions.invoke("smile-design-ai", {
      body: { action: "detect_teeth", image_url: photo, photo_type: sim.smile_photo_url ? "smile" : "intraoral" },
    });
    setBusy(null);
    if (error) {
      toast({ title: "Detection failed", description: error.message, variant: "destructive" });
      return;
    }
    const teeth = data?.teeth || [];
    await supabase.from("smile_simulations").update({ detected_teeth: teeth }).eq("id", sim.id);
    toast({ title: `Detected ${teeth.length} teeth` });
    onChange();
  };

  const addTreatment = () => setPlan([...plan, { tooth: "", treatment: "", shade: "", brand: "", notes: "" }]);
  const updateTreatment = (i: number, k: string, v: string) => setPlan(plan.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const removeTreatment = (i: number) => setPlan(plan.filter((_, idx) => idx !== i));

  const savePlan = async () => {
    await supabase.from("smile_simulations").update({ treatment_plan: plan }).eq("id", sim.id);
    toast({ title: "Treatment plan saved" });
    onChange();
  };

  const generateAfter = async (mode: "ai" | "overlay") => {
    const sourcePhoto = sim.smile_photo_url || sim.face_photo_url;
    if (!sourcePhoto) {
      toast({ title: "Upload a smile photo first", variant: "destructive" });
      return;
    }
    if (plan.length === 0) {
      toast({ title: "Add at least one treatment", variant: "destructive" });
      return;
    }
    setBusy("generate");

    if (mode === "overlay") {
      // Quick overlay: just mark before == after with brightening filter applied via CSS metadata (we set after_image_url same as before but mode='overlay')
      await supabase.from("smile_simulations").update({
        before_image_url: sourcePhoto,
        after_image_url: sourcePhoto,
        simulation_mode: "overlay",
        status: "simulated",
      }).eq("id", sim.id);
      toast({ title: "Overlay preview ready", description: "Use the comparison slider to view." });
      setBusy(null);
      onChange();
      return;
    }

    const { data, error } = await supabase.functions.invoke("smile-design-ai", {
      body: { action: "generate_simulation", image_url: sourcePhoto, treatments: plan },
    });
    if (error || !data?.image_url) {
      setBusy(null);
      toast({ title: "Generation failed", description: error?.message || "No image returned", variant: "destructive" });
      return;
    }

    // Upload generated dataURL to storage
    const blob = await (await fetch(data.image_url)).blob();
    const file = new File([blob], "after.png", { type: "image/png" });
    const url = await uploadFile(file, "after");
    await supabase.from("smile_simulations").update({
      before_image_url: sourcePhoto,
      after_image_url: url,
      simulation_mode: "ai",
      status: "simulated",
    }).eq("id", sim.id);
    toast({ title: "AI simulation ready" });
    setBusy(null);
    onChange();
  };

  const setStatus = async (status: string) => {
    const update: any = { status, patient_feedback: feedback };
    if (status === "approved" || status === "rejected") update.approved_at = new Date().toISOString();
    await supabase.from("smile_simulations").update(update).eq("id", sim.id);
    toast({ title: `Marked as ${status}` });
    onChange();
  };

  const shareWhatsApp = async () => {
    const { data: pt } = await supabase.from("patients").select("phone").eq("id", sim.patient_id || "").maybeSingle();
    const phone = (pt as any)?.phone?.replace(/\D/g, "");
    const lines = [
      `Hello ${sim.patient_name || "Patient"},`,
      `Your AI Smile Design is ready! 😊`,
      ``,
      `Treatment plan:`,
      ...plan.map((t: any) => `• ${t.treatment}${t.tooth ? ` (Tooth ${t.tooth})` : ""}`),
      ``,
      sim.after_image_url ? `Before/After preview: ${sim.after_image_url}` : "",
      `— ${sim.doctor || "Your Dental Team"}`,
    ].filter(Boolean).join("\n");
    const url = `https://wa.me/${phone || ""}?text=${encodeURIComponent(lines)}`;
    window.open(url, "_blank");
    await supabase.from("smile_simulations").update({ status: "shared" }).eq("id", sim.id);
    onChange();
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={18} className="text-primary" />
            {sim.patient_name || "Simulation"} · {sim.doctor || "—"}
            <Badge className={STATUS_COLORS[sim.status]}>{sim.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="capture" className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="capture"><Camera size={14} className="mr-1" /> Photos</TabsTrigger>
            <TabsTrigger value="detect"><ScanLine size={14} className="mr-1" /> Detection</TabsTrigger>
            <TabsTrigger value="plan"><Wand2 size={14} className="mr-1" /> Plan</TabsTrigger>
            <TabsTrigger value="simulate"><Sparkles size={14} className="mr-1" /> Simulate</TabsTrigger>
            <TabsTrigger value="approve"><Check size={14} className="mr-1" /> Approve</TabsTrigger>
          </TabsList>

          {/* PHOTOS */}
          <TabsContent value="capture" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PhotoSlot
                label="Full Face Photo"
                url={sim.face_photo_url}
                busy={busy === "face_photo_url"}
                onUpload={(e) => handlePhoto(e, "face_photo_url")}
              />
              <PhotoSlot
                label="Smile Photo"
                url={sim.smile_photo_url}
                busy={busy === "smile_photo_url"}
                onUpload={(e) => handlePhoto(e, "smile_photo_url")}
              />
            </div>
            <PhotoGroup
              label="Intraoral Photos"
              urls={sim.intraoral_photos}
              busy={busy === "intraoral_photos"}
              onUpload={(e) => handlePhoto(e, "intraoral_photos")}
            />
            <PhotoGroup
              label="Occlusal Photos"
              urls={sim.occlusal_photos}
              busy={busy === "occlusal_photos"}
              onUpload={(e) => handlePhoto(e, "occlusal_photos")}
            />
          </TabsContent>

          {/* DETECT */}
          <TabsContent value="detect" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">AI auto-detects teeth (FDI) and conditions from the smile/intraoral photo.</p>
              <Button onClick={detectTeeth} disabled={busy === "detect"} className="gap-2">
                {busy === "detect" ? <Loader2 className="animate-spin" size={14} /> : <ScanLine size={14} />}
                Run AI Detection
              </Button>
            </div>
            {sim.detected_teeth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border rounded">No teeth detected yet.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {sim.detected_teeth.map((t: any, i: number) => (
                  <div key={i} className="border rounded p-2 text-sm">
                    <div className="font-mono font-bold">FDI {t.fdi}</div>
                    <div className="text-xs text-muted-foreground capitalize">{t.condition}</div>
                    {t.notes && <div className="text-xs mt-1">{t.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* PLAN */}
          <TabsContent value="plan" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Add treatments per tooth. These will guide AI simulation.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={addTreatment} className="gap-2"><Plus size={14} /> Add</Button>
                <Button size="sm" onClick={savePlan} className="gap-2"><Check size={14} /> Save</Button>
              </div>
            </div>
            <div className="space-y-2">
              {plan.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center border rounded">No treatments. Click "Add".</p>}
              {plan.map((t: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center border rounded p-2">
                  <Input className="col-span-2 h-9" placeholder="FDI" value={t.tooth} onChange={(e) => updateTreatment(i, "tooth", e.target.value)} />
                  <Select value={t.treatment} onValueChange={(v) => updateTreatment(i, "treatment", v)}>
                    <SelectTrigger className="col-span-3 h-9"><SelectValue placeholder="Treatment" /></SelectTrigger>
                    <SelectContent>
                      {TREATMENT_TYPES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={t.shade} onValueChange={(v) => updateTreatment(i, "shade", v)}>
                    <SelectTrigger className="col-span-2 h-9"><SelectValue placeholder="Shade" /></SelectTrigger>
                    <SelectContent>
                      {SHADES.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="col-span-2 h-9" placeholder="Brand" value={t.brand} onChange={(e) => updateTreatment(i, "brand", e.target.value)} />
                  <Input className="col-span-2 h-9" placeholder="Notes" value={t.notes} onChange={(e) => updateTreatment(i, "notes", e.target.value)} />
                  <Button size="icon" variant="ghost" className="col-span-1 h-9" onClick={() => removeTreatment(i)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SIMULATE */}
          <TabsContent value="simulate" className="space-y-4">
            <div className="flex items-center gap-2">
              <Button onClick={() => generateAfter("overlay")} variant="outline" disabled={busy === "generate"} className="gap-2">
                <Eye size={14} /> Quick Overlay Preview
              </Button>
              <Button onClick={() => generateAfter("ai")} disabled={busy === "generate"} className="gap-2">
                {busy === "generate" ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                Generate AI Simulation
              </Button>
              <Badge variant="secondary">Mode: {sim.simulation_mode}</Badge>
            </div>

            {sim.before_image_url && sim.after_image_url ? (
              <>
                {/* Side by side */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">BEFORE</p>
                    <img src={sim.before_image_url} className="w-full rounded border" alt="before" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">AFTER</p>
                    <img src={sim.after_image_url} className={`w-full rounded border ${sim.simulation_mode === "overlay" ? "brightness-110 contrast-110 saturate-90" : ""}`} alt="after" />
                  </div>
                </div>

                {/* Slider */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Drag to compare</p>
                  <div className="relative w-full overflow-hidden rounded border" style={{ aspectRatio: "16/10" }}>
                    <img src={sim.before_image_url} className="absolute inset-0 w-full h-full object-cover" alt="before" />
                    <div className="absolute inset-0 overflow-hidden" style={{ width: `${compareSlider[0]}%` }}>
                      <img src={sim.after_image_url} className={`absolute inset-0 h-full object-cover ${sim.simulation_mode === "overlay" ? "brightness-110 contrast-110 saturate-90" : ""}`} style={{ width: `${100 / (compareSlider[0] / 100)}%` }} alt="after" />
                    </div>
                    <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow" style={{ left: `${compareSlider[0]}%` }} />
                  </div>
                  <Slider value={compareSlider} onValueChange={setCompareSlider} max={100} step={1} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center border rounded">Generate a simulation to view before/after.</p>
            )}
          </TabsContent>

          {/* APPROVE */}
          <TabsContent value="approve" className="space-y-3">
            <Label>Patient Feedback</Label>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} placeholder="Patient's comments about the simulation..." />
            <div className="flex gap-2 flex-wrap">
              <Button onClick={shareWhatsApp} className="gap-2 bg-green-600 hover:bg-green-700">
                <Send size={14} /> Share via WhatsApp
              </Button>
              <Button onClick={() => setStatus("approved")} className="gap-2 bg-green-600 hover:bg-green-700">
                <Check size={14} /> Patient Approved
              </Button>
              <Button onClick={() => setStatus("rejected")} variant="destructive" className="gap-2">
                <X size={14} /> Patient Rejected
              </Button>
              <Button onClick={onDelete} variant="ghost" className="ml-auto gap-2 text-destructive">
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PhotoSlot({ label, url, busy, onUpload }: { label: string; url: string | null; busy: boolean; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />} {url ? "Replace" : "Upload"}
        </Button>
        <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={onUpload} />
      </div>
      {url ? (
        <img src={url} className="w-full h-48 object-cover rounded" alt={label} />
      ) : (
        <div className="w-full h-48 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
          <Camera size={28} />
        </div>
      )}
    </div>
  );
}

function PhotoGroup({ label, urls, busy, onUpload }: { label: string; urls: string[]; busy: boolean; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label} ({urls.length})</Label>
        <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />} Add Photos
        </Button>
        <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} />
      </div>
      {urls.length === 0 ? (
        <div className="w-full h-24 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">No photos</div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {urls.map((u, i) => <img key={i} src={u} className="w-full h-24 object-cover rounded" alt="" />)}
        </div>
      )}
    </div>
  );
}
