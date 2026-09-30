import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarIcon, MessageCircle, Mail, Plus, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
}

interface BookAppointmentStepProps {
  renderQuickPatientSearch: () => JSX.Element;
  selectedPatient: Patient | null;
  doctorNames: string[];
  treatmentTypes: string[];
  defaultDoctor?: string;
  defaultSource?: string;
  embedded?: boolean;
  prefilledTeeth?: number[];
  defaultTreatment?: string;
}

interface DayAppointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  doctor: string | null;
  type: string;
  status: string;
  patient_name: string;
  patient_phone: string | null;
}

const quadrantPrefix: Record<string, number> = { q1: 10, q2: 20, q3: 30, q4: 40 };
type QuadrantKey = keyof typeof quadrantPrefix;

const BookAppointmentStep = ({
  renderQuickPatientSearch,
  selectedPatient,
  doctorNames,
  treatmentTypes,
  defaultDoctor = "",
  defaultSource = "walk-in",
  embedded = false,
  prefilledTeeth,
  defaultTreatment,
}: BookAppointmentStepProps) => {
  const [appDate, setAppDate] = useState<Date | undefined>(undefined);
  const [appHour, setAppHour] = useState("09");
  const [appMinute, setAppMinute] = useState("00");
  const [appPeriod, setAppPeriod] = useState<"AM" | "PM">("AM");
  const [treatment, setTreatment] = useState(defaultTreatment || "");
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [toothNumber, setToothNumber] = useState("");
  const [quadrantInputs, setQuadrantInputs] = useState<Record<QuadrantKey, string>>({ q1: "", q2: "", q3: "", q4: "" });
  const [notes, setNotes] = useState("");
  const [dayAppointments, setDayAppointments] = useState<DayAppointment[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [lastBookedApp, setLastBookedApp] = useState<{ date: string; time: string; treatment: string; doctor?: string } | null>(null);

  // Touched guards — once user edits, prefill never overwrites
  const quadrantTouchedRef = useRef(false);
  const treatmentTouchedRef = useRef(false);

  const syncToothNumberFromQuadrants = (nextInputs: Record<QuadrantKey, string>) => {
    const allTeeth = (Object.entries(nextInputs) as [QuadrantKey, string][]).flatMap(([quadrant, rawValue]) => {
      const prefix = quadrantPrefix[quadrant];
      return rawValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number.parseInt(item, 10))
        .filter((num) => !Number.isNaN(num) && num >= 1 && num <= 8)
        .map((num) => prefix + num);
    });

    setToothNumber(allTeeth.join(", "));
  };

  const updateQuadrant = (quadrant: QuadrantKey, value: string) => {
    quadrantTouchedRef.current = true;
    const sanitizedValue = value.replace(/[^0-9,\s]/g, "");
    setQuadrantInputs((prev) => {
      const nextInputs = {
        ...prev,
        [quadrant]: sanitizedValue,
      };
      syncToothNumberFromQuadrants(nextInputs);
      return nextInputs;
    });
  };

  // Prefill quadrants from FDI teeth on mount / when prop changes — only if user hasn't edited
  useEffect(() => {
    if (quadrantTouchedRef.current) return;
    if (!prefilledTeeth || prefilledTeeth.length === 0) return;
    const next: Record<QuadrantKey, string> = { q1: "", q2: "", q3: "", q4: "" };
    prefilledTeeth.forEach((fdi) => {
      const digit = fdi % 10;
      if (digit < 1 || digit > 8) return;
      let key: QuadrantKey | null = null;
      if (fdi >= 11 && fdi <= 18) key = "q1";
      else if (fdi >= 21 && fdi <= 28) key = "q2";
      else if (fdi >= 31 && fdi <= 38) key = "q3";
      else if (fdi >= 41 && fdi <= 48) key = "q4";
      if (!key) return;
      next[key] = next[key] ? `${next[key]},${digit}` : String(digit);
    });
    setQuadrantInputs(next);
    syncToothNumberFromQuadrants(next);
  }, [prefilledTeeth]);

  // Prefill treatment from prop — only if user hasn't edited
  useEffect(() => {
    if (treatmentTouchedRef.current) return;
    if (defaultTreatment) setTreatment(defaultTreatment);
  }, [defaultTreatment]);


  // Fetch appointments for selected date
  useEffect(() => {
    if (!appDate) { setDayAppointments([]); return; }
    fetchDayAppointments(format(appDate, "yyyy-MM-dd"));
  }, [appDate]);

  const fetchDayAppointments = async (dateStr: string) => {
    setLoadingDay(true);
    const { data } = await supabase
      .from("appointments")
      .select("id, appointment_date, start_time, end_time, doctor, type, status, patient_id")
      .eq("appointment_date", dateStr)
      .order("start_time", { ascending: true });

    if (data && data.length > 0) {
      const patientIds = [...new Set(data.map(a => a.patient_id))];
      const { data: patients } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .in("id", patientIds);

      const patientMap: Record<string, { name: string; phone: string | null }> = {};
      (patients || []).forEach(p => {
        patientMap[p.id] = { name: `${p.first_name} ${p.last_name}`, phone: p.phone };
      });

      setDayAppointments(data.map(a => ({
        ...a,
        patient_name: patientMap[a.patient_id]?.name || "Unknown",
        patient_phone: patientMap[a.patient_id]?.phone || null,
      })));
    } else {
      setDayAppointments([]);
    }
    setLoadingDay(false);
  };

  const formatTime12 = (time24: string) => {
    const [h, m] = time24.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };

  const isValidDoctorName = (name: string) => /^Dr\.?\s?[A-Z]/.test(name.trim());
  const validDoctorNames = doctorNames.filter(isValidDoctorName);

  const handleBookAppointment = async () => {
    if (!appDate || !selectedPatient || !treatment) {
      toast({ title: "Missing fields", description: "Please select date, treatment", variant: "destructive" });
      return;
    }
    if (doctor && !isValidDoctorName(doctor)) {
      toast({ title: "Invalid doctor", description: "Only doctors with proper 'Dr.' prefix and capitalized names are allowed.", variant: "destructive" });
      return;
    }


    const dateStr = format(appDate, "yyyy-MM-dd");
    let h24 = parseInt(appHour);
    if (appPeriod === "AM" && h24 === 12) h24 = 0;
    else if (appPeriod === "PM" && h24 !== 12) h24 += 12;
    const mins = parseInt(appMinute);
    const startTime = `${String(h24).padStart(2, "0")}:${appMinute}`;
    const endMin = mins + 30;
    const endTime = `${String(h24 + Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    const displayTime = `${appHour}:${appMinute} ${appPeriod}`;

    const appointmentNotes = toothNumber
      ? `${treatment} (Tooth #${toothNumber})${notes ? ` - ${notes}` : ""}`
      : `${treatment}${notes ? ` - ${notes}` : ""}`;

    const { error } = await supabase.from("appointments").insert({
      patient_id: selectedPatient.id,
      appointment_date: dateStr,
      start_time: startTime,
      end_time: endTime,
      type: treatment,
      doctor: doctor || null,
      notes: appointmentNotes,
      status: "scheduled",
      source: defaultSource,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Appointment Booked!", description: `${treatment} on ${format(appDate, "dd MMM yyyy")} at ${displayTime}` });
      setLastBookedApp({ date: format(appDate, "dd MMM yyyy"), time: displayTime, treatment, doctor });
      // Refresh day appointments
      fetchDayAppointments(dateStr);
      // Reset form
      setTreatment("");
      setDoctor(defaultDoctor);
      setToothNumber("");
      setQuadrantInputs({ q1: "", q2: "", q3: "", q4: "" });
      setNotes("");
    }
  };

  const sendWhatsApp = () => {
    if (!selectedPatient?.phone || !lastBookedApp) return;
    const first = selectedPatient.first_name || "there";
    const message = `Hi ${first}, your appointment has been booked:\n\n📅 Date: ${lastBookedApp.date}\n⏰ Time: ${lastBookedApp.time}\n🦷 Treatment: ${lastBookedApp.treatment}\n\nPlease arrive 10 minutes early. Thank you!`;
    void sendClinicWhatsApp({
      patient: selectedPatient,
      templateKey: "appointment_booking_confirmation",
      bodyParams: [
        `${selectedPatient.first_name || ""} ${selectedPatient.last_name || ""}`.trim() || first,
        lastBookedApp.date,
        lastBookedApp.time,
        lastBookedApp.treatment || "Consultation",
        lastBookedApp.doctor || doctor || "Our Doctor",
      ],
      fallbackText: message,
      label: "Appointment confirmation",
    });
  };

  const sendEmail = () => {
    if (!selectedPatient?.email || !lastBookedApp) return;
    const subject = `Appointment Confirmation - ${lastBookedApp.date}`;
    const body = `Dear ${selectedPatient.first_name},\n\nYour appointment has been booked:\n\nDate: ${lastBookedApp.date}\nTime: ${lastBookedApp.time}\nTreatment: ${lastBookedApp.treatment}\n\nPlease arrive 10 minutes early.\n\nThank you!`;
    window.open(`mailto:${selectedPatient.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
  };

  const quadrants = [
    { key: "q1" as const, value: quadrantInputs.q1 },
    { key: "q2" as const, value: quadrantInputs.q2 },
    { key: "q4" as const, value: quadrantInputs.q4 },
    { key: "q3" as const, value: quadrantInputs.q3 },
  ];

  const content = (
    <div className="space-y-5">
      {!embedded && renderQuickPatientSearch()}

        {!selectedPatient && (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon size={48} className="mx-auto mb-3 opacity-40" />
            <p>Search and select a patient to book an appointment</p>
          </div>
        )}

        {selectedPatient && (
          <>
            {/* Appointment Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border border-border rounded-lg bg-muted/30">
              {/* Tooth Quadrant */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Tooth Number (Quadrant)</Label>
                <div className="grid grid-cols-2 gap-px bg-border rounded overflow-hidden" style={{ width: 220 }}>
                  {quadrants.map((q, qi) => (
                      <input
                        key={q.key}
                        className={cn(
                          "h-9 w-full px-2 text-center text-xs font-semibold border border-border bg-background leading-tight outline-none focus:ring-1 focus:ring-primary/50",
                          qi === 0 && "rounded-tl", qi === 1 && "rounded-tr", qi === 2 && "rounded-bl", qi === 3 && "rounded-br",
                          q.value.trim().length > 0 && "bg-primary/10 text-primary border-primary/40"
                        )}
                        placeholder={q.key.toUpperCase()}
                        value={q.value}
                        onChange={(e) => updateQuadrant(q.key, e.target.value)}
                      />
                  ))}
                </div>
              </div>

              {/* Treatment */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Treatment</Label>
                <Select value={treatment} onValueChange={(v) => { treatmentTouchedRef.current = true; setTreatment(v); }}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select treatment" /></SelectTrigger>
                  <SelectContent>{treatmentTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/(^|\s)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase())}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Doctor */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Doctor</Label>
                <Select value={doctor} onValueChange={setDoctor}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>{validDoctorNames.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full h-9 text-xs justify-start gap-1">
                      <CalendarIcon size={12} />
                      {appDate ? format(appDate, "dd MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={appDate} onSelect={setAppDate} className="pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Time */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Time</Label>
                <div className="flex gap-1 items-center">
                  <Select value={appHour} onValueChange={setAppHour}>
                    <SelectTrigger className="w-16 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{Array.from({ length: 12 }, (_, i) => { const v = String(i + 1).padStart(2, "0"); return <SelectItem key={v} value={v}>{v}</SelectItem>; })}</SelectContent>
                  </Select>
                  <span className="text-xs font-bold">:</span>
                  <Select value={appMinute} onValueChange={setAppMinute}>
                    <SelectTrigger className="w-16 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{["00","05","10","15","20","25","30","35","40","45","50","55"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={appPeriod} onValueChange={(v) => setAppPeriod(v as "AM" | "PM")}>
                    <SelectTrigger className="w-16 h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." className="h-9 text-xs" />
              </div>
            </div>

            {/* Book Button */}
            <Button onClick={handleBookAppointment} disabled={!appDate || !treatment} className="w-full gap-2">
              <Plus size={16} /> Book Appointment
            </Button>

            {/* WhatsApp / SMS / Email after booking */}
            {lastBookedApp && (
              <div className="flex items-center gap-2 p-3 bg-accent/50 border border-border rounded-lg">
                <Badge className="bg-primary text-primary-foreground text-xs">Booked</Badge>
                <span className="text-xs flex-1">
                  {lastBookedApp.treatment} — {lastBookedApp.date} at {lastBookedApp.time}
                </span>
                <div className="flex gap-1">
                  {selectedPatient.phone && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={sendWhatsApp}>
                      <MessageCircle size={12} /> WhatsApp
                    </Button>
                  )}
                  {selectedPatient.email && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={sendEmail}>
                      <Mail size={12} /> Email
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Day's Appointments */}
            {appDate && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Clock size={14} className="text-primary" />
                  Appointments on {format(appDate, "dd MMM yyyy")}
                  <Badge variant="secondary" className="text-xs">{dayAppointments.length}</Badge>
                </h4>

                {loadingDay && <p className="text-xs text-muted-foreground text-center py-2">Loading...</p>}

                {!loadingDay && dayAppointments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No appointments on this date</p>
                )}

                {!loadingDay && dayAppointments.length > 0 && (
                  <div className="rounded-md border max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Patient</TableHead>
                          <TableHead className="text-xs">Doctor</TableHead>
                          <TableHead className="text-xs">Treatment</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dayAppointments.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="text-xs">{formatTime12(a.start_time)} - {formatTime12(a.end_time)}</TableCell>
                            <TableCell className="text-xs font-medium">{a.patient_name}</TableCell>
                            <TableCell className="text-xs">{a.doctor || "—"}</TableCell>
                            <TableCell className="text-xs">{a.type}</TableCell>
                            <TableCell>
                              <Badge variant={a.status === "scheduled" ? "secondary" : "default"} className="text-[10px]">
                                {a.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <CalendarIcon size={20} /> Book Appointment
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};

export default BookAppointmentStep;
