import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Stethoscope } from "lucide-react";
import { z } from "zod";

const schema = z.object({
  participant_name: z.string().trim().min(2, "Enter your name").max(100),
  mobile: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit mobile"),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  age: z.coerce.number().int().min(1).max(120).optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]),
  dental_concern: z.string().trim().max(500).optional().or(z.literal("")),
});

const CampRegister = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaign, setCampaign] = useState<{ name: string; camp_code: string; campaign_type: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    participant_name: "", mobile: "", email: "", age: "", gender: "male", dental_concern: "",
  });

  useEffect(() => {
    (async () => {
      if (!campaignId) return;
      const { data, error } = await (supabase as any).rpc("camp_public_info", { p_campaign_id: campaignId });
      const row = Array.isArray(data) ? data[0] : data;
      if (error) setError("Unable to load this camp. Please try again.");
      else if (!row) setError("This camp link is invalid, or QR registration is not enabled for this camp yet.");
      else setCampaign(row as any);
      setLoading(false);
    })();
  }, [campaignId]);

  const friendlyError = (msg: string) => {
    if (msg.includes("CAMP_NOT_FOUND")) return "This camp link is invalid.";
    if (msg.includes("QR_DISABLED")) return "QR registration is not enabled for this camp yet.";
    if (msg.includes("INVALID_NAME")) return "Please enter your full name.";
    if (msg.includes("INVALID_MOBILE")) return "Enter a valid 10-digit mobile number.";
    if (msg.includes("INVALID_AGE")) return "Enter a valid age.";
    if (msg.includes("INVALID_GENDER")) return "Please select a gender.";
    return "Registration failed. Please try again.";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { data, error } = await (supabase as any).rpc("camp_self_register", {
      p_campaign_id: campaignId,
      p_participant_name: parsed.data.participant_name,
      p_mobile: parsed.data.mobile,
      p_email: parsed.data.email || null,
      p_age: parsed.data.age === "" ? null : parsed.data.age,
      p_gender: parsed.data.gender,
      p_dental_concern: parsed.data.dental_concern || null,
    });
    setSubmitting(false);
    if (error) {
      setError(friendlyError(error.message || ""));
      return;
    }
    setSuccess(data as string);
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center text-destructive">{error}</CardContent></Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            <h2 className="text-2xl font-bold">Registration Successful!</h2>
            <p className="text-muted-foreground">Show this Unique ID to the doctor at the screening desk:</p>
            <div className="bg-primary/10 border-2 border-primary rounded-lg p-4">
              <p className="text-3xl font-mono font-bold text-primary tracking-wider">{success}</p>
            </div>
            <p className="text-xs text-muted-foreground">Please save / screenshot this ID.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 flex items-start sm:items-center justify-center">
      <Card className="max-w-md w-full my-8">
        <CardHeader className="text-center">
          <Stethoscope className="h-12 w-12 mx-auto text-primary mb-2" />
          <CardTitle>{campaign?.name}</CardTitle>
          <p className="text-xs text-muted-foreground font-mono">{campaign?.camp_code}</p>
          <p className="text-sm text-muted-foreground pt-2">Free Dental Screening Registration</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.participant_name} onChange={(e) => setForm({ ...form, participant_name: e.target.value })} maxLength={100} required />
            </div>
            <div>
              <Label>Mobile Number *</Label>
              <Input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} maxLength={10} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Age</Label>
                <Input type="number" min={1} max={120} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </div>
              <div>
                <Label>Gender *</Label>
                <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Any dental problem? (Optional)</Label>
              <Textarea value={form.dental_concern} onChange={(e) => setForm({ ...form, dental_concern: e.target.value })} maxLength={500} rows={3} placeholder="e.g., tooth pain, sensitivity, bleeding gums..." />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CampRegister;
