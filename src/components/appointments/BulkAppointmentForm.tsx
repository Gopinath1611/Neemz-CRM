import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Search } from "lucide-react";
import { type Patient } from "@/pages/Appointments";
import { DEFAULT_APPOINTMENT_TYPE_OPTIONS, DEFAULT_DOCTOR_OPTIONS, type SelectOption } from "@/hooks/useClinicMasters";

interface BulkEntry {
  patientId: string;
  patientSearch: string;
  showSuggestions: boolean;
  date: string;
  type: string;
  doctor: string;
}

interface Props {
  patients: Patient[];
  doctorOptions?: SelectOption[];
  treatmentOptions?: SelectOption[];
  onSuccess: () => void;
}

const emptyEntry = (): BulkEntry => ({
  patientId: "",
  patientSearch: "",
  showSuggestions: false,
  date: new Date().toISOString().split("T")[0],
  type: "",
  doctor: "",
});

const BulkAppointmentForm = ({
  patients,
  doctorOptions = DEFAULT_DOCTOR_OPTIONS,
  treatmentOptions = DEFAULT_APPOINTMENT_TYPE_OPTIONS,
  onSuccess,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<BulkEntry[]>([emptyEntry(), emptyEntry()]);

  const updateEntry = (index: number, field: keyof BulkEntry, value: string | boolean) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const addEntry = () => setEntries((prev) => [...prev, emptyEntry()]);
  const removeEntry = (index: number) => setEntries((prev) => prev.filter((_, i) => i !== index));

  const getFilteredPatients = (search: string) => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q))
    ).slice(0, 6);
  };

  useEffect(() => {
    setEntries((prev) =>
      prev.map((entry) => ({
        ...entry,
        doctor: doctorOptions.some((option) => option.value === entry.doctor)
          ? entry.doctor
          : (doctorOptions[0]?.value ?? ""),
        type: treatmentOptions.some((option) => option.value === entry.type)
          ? entry.type
          : (treatmentOptions[0]?.value ?? ""),
      })),
    );
  }, [doctorOptions, treatmentOptions]);

  const selectPatient = (index: number, patient: Patient) => {
    setEntries((prev) => prev.map((e, i) =>
      i === index ? { ...e, patientId: patient.id, patientSearch: `${patient.first_name} ${patient.last_name}`, showSuggestions: false } : e
    ));
  };

  const handleBulkSubmit = async () => {
    const valid = entries.filter((e) => e.patientId && e.date);
    if (valid.length === 0) {
      toast({ title: "Error", description: "Please fill at least one appointment", variant: "destructive" });
      return;
    }
    setLoading(true);
    const now = format(new Date(), "HH:mm:ss");
    try {
      const rows = valid.map((e) => ({
        patient_id: e.patientId,
        appointment_date: e.date,
        start_time: now,
        end_time: now,
        type: e.type,
        doctor: e.doctor,
        source: "bulk",
      }));
      const { error } = await supabase.from("appointments").insert(rows);
      if (error) throw error;
      toast({ title: `${valid.length} appointments booked!` });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
        {entries.map((entry, idx) => {
          const filtered = getFilteredPatients(entry.patientSearch);
          return (
            <div key={idx} className="p-3 border rounded-lg space-y-2 bg-secondary/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Appointment #{idx + 1}</span>
                {entries.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeEntry(idx)}>
                    <Trash2 size={12} className="text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1 relative">
                  <Label className="text-[10px]">Patient</Label>
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search patient..."
                      className="text-xs h-8 pl-7"
                      value={entry.patientSearch}
                      onChange={(e) => {
                        updateEntry(idx, "patientSearch", e.target.value);
                        updateEntry(idx, "showSuggestions", true);
                        if (entry.patientId) updateEntry(idx, "patientId", "");
                      }}
                      onFocus={() => entry.patientSearch && updateEntry(idx, "showSuggestions", true)}
                    />
                  </div>
                  {entry.showSuggestions && filtered.length > 0 && (
                    <div className="absolute z-50 w-full mt-0.5 bg-popover border border-border rounded-md shadow-lg max-h-32 overflow-y-auto">
                      {filtered.map((p) => (
                        <button
                          key={p.id}
                          className="w-full text-left px-2 py-1.5 hover:bg-accent/50 text-[11px] transition-colors"
                          onClick={() => selectPatient(idx, p)}
                        >
                          <span className="font-medium">{p.first_name} {p.last_name}</span>
                          <span className="text-muted-foreground ml-1">· {p.phone || "No phone"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Date</Label>
                  <Input type="date" className="h-8 text-xs" value={entry.date} onChange={(e) => updateEntry(idx, "date", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Type</Label>
                  <Select value={entry.type} onValueChange={(v) => updateEntry(idx, "type", v)}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Treatment" /></SelectTrigger>
                    <SelectContent>
                      {treatmentOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Doctor</Label>
                  <Select value={entry.doctor} onValueChange={(v) => updateEntry(idx, "doctor", v)}>
                    <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button variant="outline" className="w-full gap-2 text-xs" onClick={addEntry}>
        <Plus size={14} /> Add Another Appointment
      </Button>

      <Button
        className="w-full gradient-primary text-primary-foreground"
        onClick={handleBulkSubmit}
        disabled={loading}
      >
        {loading ? "Booking..." : `Book ${entries.filter((e) => e.patientId).length} Appointments`}
      </Button>
    </div>
  );
};

export default BulkAppointmentForm;
