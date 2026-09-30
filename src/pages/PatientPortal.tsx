import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, CreditCard, Stethoscope, User, LogOut, Phone, Hash, ArrowLeft, IndianRupee, Clock, ShieldCheck, Camera, X } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatPatientCode } from "@/lib/patientCode";

const FAKE_OTP = "1234";

const PatientPortal = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [logging, setLogging] = useState(false);
  const [matchedPatient, setMatchedPatient] = useState<any>(null);

  const handleSendOTP = async () => {
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      toast({ title: "சரியான 10 இலக்க மொபைல் எண் கொடுக்கவும்", variant: "destructive" });
      return;
    }
    setLogging(true);
    try {
      // Find patient by phone number
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, patient_code")
        .like("phone", `%${cleanPhone}%`)
        .limit(1)
        .single();

      if (error || !data) {
        toast({ title: "இந்த மொபைல் எண்ணில் Patient கிடைக்கவில்லை", variant: "destructive" });
        return;
      }
      setMatchedPatient(data);
      setStep("otp");
      toast({ title: "OTP அனுப்பப்பட்டது", description: `Testing OTP: ${FAKE_OTP}` });
    } catch {
      toast({ title: "Error occurred", variant: "destructive" });
    } finally {
      setLogging(false);
    }
  };

  const handleVerifyOTP = () => {
    if (otp !== FAKE_OTP) {
      toast({ title: "OTP தவறானது. மீண்டும் முயற்சிக்கவும்.", variant: "destructive" });
      return;
    }
    setPatientId(matchedPatient.id);
    setIsLoggedIn(true);
    toast({ title: "Login வெற்றிகரமாக முடிந்தது!" });
  };

  if (isLoggedIn && patientId) {
    return <PatientDashboard patientId={patientId} onLogout={() => { setIsLoggedIn(false); setPatientId(null); setPhone(""); setOtp(""); setStep("phone"); setMatchedPatient(null); navigate("/"); }} />;
  }

   return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-muted-foreground">
          <ArrowLeft size={16} /> Admin Panel
        </Button>
      </div>
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            {step === "phone" ? <Phone size={32} className="text-primary" /> : <ShieldCheck size={32} className="text-primary" />}
          </div>
          <CardTitle className="text-xl font-display">Patient Portal</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "phone" ? "உங்கள் மொபைல் எண்ணை உள்ளிடவும்" : "OTP-ஐ உள்ளிடவும்"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "phone" ? (
            <>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs"><Phone size={12} /> Mobile Number</Label>
                <Input placeholder="எ.கா: 9876543210" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={10} />
              </div>
              <Button className="w-full" onClick={handleSendOTP} disabled={logging}>
                {logging ? "Checking..." : "Send OTP"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground text-center">
                <Phone size={12} className="inline mr-1" />{phone} க்கு OTP அனுப்பப்பட்டது
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={4} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button className="w-full" onClick={handleVerifyOTP} disabled={otp.length < 4}>
                Verify & Login
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setStep("phone"); setOtp(""); }}>
                ← மொபைல் எண் மாற்ற
              </Button>
              <p className="text-[10px] text-center text-muted-foreground/60">Testing mode: OTP is {FAKE_OTP}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const PatientDashboard = ({ patientId, onLogout }: { patientId: string; onLogout: () => void }) => {
  const { data: patient } = useQuery({
    queryKey: ["portal-patient", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("patients").select("*").eq("id", patientId).single();
      return data;
    },
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["portal-appointments", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .eq("patient_id", patientId)
        .order("appointment_date", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: checkins = [] } = useQuery({
    queryKey: ["portal-checkins", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("patient_checkins")
        .select("*")
        .eq("patient_id", patientId)
        .order("checkin_time", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: billings = [] } = useQuery({
    queryKey: ["portal-billings", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("billings")
        .select("*, billing_items(*)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: treatmentPlans = [] } = useQuery({
    queryKey: ["portal-treatments", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("treatment_plans")
        .select("*, treatment_plan_items(*)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const { data: clinicalPhotos = [] } = useQuery({
    queryKey: ["portal-photos", patientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clinical_photos")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const totalBilled = billings.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
  const totalPaid = billings.reduce((s: number, b: any) => s + Number(b.amount_paid || 0), 0);
  const pendingAmount = totalBilled - totalPaid;

  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">{patient?.first_name} {patient?.last_name}</p>
          <p className="text-xs opacity-80">ID: {formatPatientCode(patient?.patient_code)} · {patient?.phone}</p>
        </div>
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={onLogout}>
          <LogOut size={18} />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <Calendar size={18} className="mx-auto text-primary mb-1" />
            <p className="text-lg font-bold">{appointments.length}</p>
            <p className="text-[10px] text-muted-foreground">Appointments</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <Stethoscope size={18} className="mx-auto text-accent mb-1" />
            <p className="text-lg font-bold">{treatmentPlans.length}</p>
            <p className="text-[10px] text-muted-foreground">Treatments</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 text-center">
            <IndianRupee size={18} className="mx-auto text-warning mb-1" />
            <p className="text-lg font-bold">₹{pendingAmount.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="appointments" className="px-3">
        <TabsList className="w-full grid grid-cols-4 h-9">
          <TabsTrigger value="appointments" className="text-[10px] sm:text-xs">Appointments</TabsTrigger>
          <TabsTrigger value="treatments" className="text-[10px] sm:text-xs">Treatments</TabsTrigger>
          <TabsTrigger value="billing" className="text-[10px] sm:text-xs">Billing</TabsTrigger>
          <TabsTrigger value="photos" className="text-[10px] sm:text-xs">Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-3 space-y-2">
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No appointments</p>
          ) : appointments.map((apt: any) => (
            <Card key={apt.id} className="shadow-sm">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{format(new Date(apt.appointment_date), "dd MMM yyyy")}</p>
                  <p className="text-xs text-muted-foreground">{apt.start_time?.slice(0, 5)} · {apt.type}</p>
                  <p className="text-xs text-muted-foreground">{apt.doctor}</p>
                </div>
                <Badge variant={apt.status === "completed" ? "default" : apt.status === "checked_in" ? "secondary" : "outline"} className="text-[10px]">
                  {apt.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="treatments" className="mt-3 space-y-2">
          {treatmentPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No treatment plans</p>
          ) : treatmentPlans.map((plan: any) => (
            <Card key={plan.id} className="shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{format(new Date(plan.created_at), "dd MMM yyyy")}</p>
                  <Badge variant={plan.status === "completed" ? "default" : "secondary"} className="text-[10px]">{plan.status}</Badge>
                </div>
                {(plan.treatment_plan_items || []).map((item: any) => (
                  <div key={item.id} className="text-xs text-muted-foreground flex justify-between border-t border-border pt-1 mt-1">
                    <span>{item.treatment_type} {item.tooth_number ? `(#${item.tooth_number})` : ""}</span>
                    <span>₹{Number(item.estimated_cost || 0).toLocaleString("en-IN")}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="billing" className="mt-3 space-y-2">
          {/* Billing summary */}
          <Card className="shadow-sm border-primary/20">
            <CardContent className="p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-bold">₹{totalBilled.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="text-sm font-bold text-success">₹{totalPaid.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-sm font-bold text-destructive">₹{pendingAmount.toLocaleString("en-IN")}</p>
              </div>
            </CardContent>
          </Card>

          {billings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No bills</p>
          ) : billings.map((bill: any) => (
            <Card key={bill.id} className="shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">{bill.invoice_number || "—"}</p>
                  <Badge variant={bill.payment_status === "paid" ? "default" : bill.payment_status === "partial" ? "secondary" : "destructive"} className="text-[10px]">
                    {bill.payment_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{format(new Date(bill.created_at), "dd MMM yyyy")}</p>
                <div className="flex justify-between mt-2 text-xs">
                  <span>Total: ₹{Number(bill.total_amount).toLocaleString("en-IN")}</span>
                  <span>Paid: ₹{Number(bill.amount_paid).toLocaleString("en-IN")}</span>
                </div>
                {(bill.billing_items || []).length > 0 && (
                  <div className="mt-2 border-t border-border pt-1 space-y-0.5">
                    {(bill.billing_items || []).map((item: any) => (
                      <div key={item.id} className="text-[11px] text-muted-foreground flex justify-between">
                        <span>{item.treatment_type}</span>
                        <span>₹{Number(item.total_price).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="photos" className="mt-3 space-y-2">
          {clinicalPhotos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No photos or X-rays</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {clinicalPhotos.map((photo: any) => {
                  const url = photo.file_path?.startsWith("http")
                    ? photo.file_path
                    : supabase.storage.from("clinical-photos").getPublicUrl(photo.file_path).data.publicUrl;
                  return (
                    <div key={photo.id} className="relative cursor-pointer group" onClick={() => setSelectedPhoto(url)}>
                      <img
                        src={url}
                        alt={photo.photo_type}
                        className="w-full aspect-square object-cover rounded-lg border border-border"
                      />
                      <Badge className="absolute bottom-1 left-1 text-[8px] bg-background/80 text-foreground">
                        {photo.photo_type === "xray" ? "X-Ray" : photo.photo_type}
                      </Badge>
                      {photo.tooth_number && (
                        <Badge variant="secondary" className="absolute top-1 right-1 text-[8px]">
                          #{photo.tooth_number}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground text-center">{clinicalPhotos.length} photos & X-rays</p>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-foreground" onClick={() => setSelectedPhoto(null)}>
            <X size={24} />
          </Button>
          <img src={selectedPhoto} alt="Clinical photo" className="max-w-full max-h-[85vh] rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
};

export default PatientPortal;
