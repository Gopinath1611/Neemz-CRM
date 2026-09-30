import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Target, Users, Ticket, PhoneCall, BarChart3, Handshake, Calculator,
  LayoutDashboard, Download, Plus, Pencil, Trash2, Search, Filter, Eye, Check, X, Clock,
  ChevronRight, TrendingUp, TrendingDown, IndianRupee, Calendar, MapPin, Phone, Mail,
  MessageCircle, CheckCheck, MoreHorizontal, Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, addDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import InstitutionDetailDialog from "@/components/campaigns/InstitutionDetailDialog";
import CampQRTab from "@/components/campaigns/CampQRTab";
import CampQRViewDialog from "@/components/campaigns/CampQRViewDialog";
import { QrCode, FileText } from "lucide-react";
import { sendClinicWhatsApp } from "@/lib/whatsappSender";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Doctor lists are stored comma-separated in the existing text columns
const parseDoctorList = (v?: string | null): string[] =>
  (v || "").split(",").map(s => s.trim()).filter(Boolean);
// keeps blank entries so in-progress guest doctor rows are not dropped
const splitRawList = (v?: string | null): string[] =>
  v ? v.split(",").map(s => s.trim()) : [];


// ==================== TYPES ====================
interface Institution {
  id: string; name: string; category: string; address: string; area: string;
  contact_person_name: string; contact_person_role: string; phone: string; email: string;
  decision_maker_level: string; last_visit_date: string | null; next_followup_date: string | null;
  status: string; notes: string; assigned_coordinator: string; created_at: string;
}
interface Campaign {
  id: string; name: string; campaign_type: string; institution_id: string | null;
  campaign_date: string | null; objective: string; expected_participants: number;
  doctor_assigned: string; assistant_assigned: string; coordinator_assigned: string;
  doctor_type?: string | null; guest_doctor_name?: string | null;
  guest_doctor_contact?: string | null; guest_doctor_specialization?: string | null;
  assistant_type?: string | null; guest_assistant_name?: string | null;
  guest_assistant_contact?: string | null; coordinator_contact?: string | null;
  approval_status: string; campaign_status: string; estimated_cost: number; actual_cost: number;
  notes: string; checklist: Record<string, boolean>; created_at: string;
  institutions?: { name: string } | null;
  qr_enabled?: boolean; camp_code?: string | null;
}
interface ScreeningLead {
  id: string; campaign_id: string; participant_name: string; age: number | null;
  gender: string; mobile: string; institution_name: string; department_class: string;
  chief_complaint: string; chief_complaints?: string[] | null; screening_findings: string; recommended_treatment: string;
  treatment_tags: string[]; priority_level: string; interested_in_visit: boolean;
  coupon_issued: boolean; followup_status: string; converted_to_patient: boolean;
  created_at: string; unique_code?: string | null; email?: string | null;
  dental_concern?: string | null; source?: string; screened?: boolean;
  doctor_name?: string | null;
}
interface CampaignCoupon {
  id: string; lead_id: string; campaign_id: string; offer_type: string;
  discount_percentage: number; expiry_date: string | null; redeemed: boolean;
  redeemed_date: string | null; coupon_code?: string | null;
  sent_via_whatsapp?: boolean; whatsapp_sent_at?: string | null;
}
interface CampaignFollowup {
  id: string; lead_id: string; campaign_id: string; followup_type: string;
  scheduled_date: string; status: string; sent_at: string | null; notes: string;
}
interface CorporatePartnership {
  id: string; company_name: string; annual_dental_package: boolean;
  employee_coverage_count: number; visit_frequency: string; insurance_supported: boolean;
  csr_collaboration: boolean; contract_start_date: string | null; contract_renewal_date: string | null;
  partner_status: string; notes: string;
}

const TREATMENT_TAGS = [
  "Scaling","Filling","Extraction","Wisdom Tooth Removal","Braces","Aligners",
  "Implant Consultation","Smile Design","Full Mouth Rehab","Pediatric Treatment","Other"
];

const CHIEF_COMPLAINT_OPTIONS = [
  "Toothache", "Bleeding Gums", "Sensitivity", "Bad Breath",
  "Broken/Chipped Tooth", "Cavity", "Swelling", "Routine Checkup", "Other"
];


const statusColors: Record<string, string> = {
  not_contacted: "bg-gray-100 text-gray-700", contacted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700", scheduled: "bg-yellow-100 text-yellow-700",
  completed: "bg-emerald-100 text-emerald-700", partner: "bg-purple-100 text-purple-700",
  planned: "bg-blue-100 text-blue-700", cancelled: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700", normal: "bg-gray-100 text-gray-700",
  moderate: "bg-yellow-100 text-yellow-700", urgent: "bg-red-100 text-red-700",
  prospect: "bg-gray-100 text-gray-700", active: "bg-green-100 text-green-700",
  inactive: "bg-red-100 text-red-700", expired: "bg-orange-100 text-orange-700",
};

const CHART_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16"];

const OfflineCampaigns = () => {
  const { toast } = useToast();
  const { doctorOptions, doctorNames, assistantOptions } = useClinicMasters();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("ceo-dashboard");

  // Sync tab with URL hash
  useEffect(() => {
    const hash = location.hash.replace("#", "");
    if (hash && ["institutions", "campaigns", "qr", "leads", "coupons", "followups", "partnerships", "roi", "analytics"].includes(hash)) {
      setActiveTab(hash);
    } else if (!hash) {
      setActiveTab("ceo-dashboard");
    }
  }, [location.hash]);

  // ===== DATA =====
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [screeningLeads, setScreeningLeads] = useState<ScreeningLead[]>([]);
  const [coupons, setCoupons] = useState<CampaignCoupon[]>([]);
  const [followups, setFollowups] = useState<CampaignFollowup[]>([]);
  const [partnerships, setPartnerships] = useState<CorporatePartnership[]>([]);
  const [couponStatusFilter, setCouponStatusFilter] = useState("all");
  const [couponOfferFilter, setCouponOfferFilter] = useState("all");
  const [sendingCouponId, setSendingCouponId] = useState<string | null>(null);
  const [pushingLeadId, setPushingLeadId] = useState<string | null>(null);
  const assistants = assistantOptions.map((o) => ({ id: o.value, name: o.label }));

  // ===== DIALOGS =====
  const [instDialog, setInstDialog] = useState(false);
  const [campDialog, setCampDialog] = useState(false);
  const [qrViewCamp, setQrViewCamp] = useState<Campaign | null>(null);
  const [leadDialog, setLeadDialog] = useState(false);
  const [couponDialog, setCouponDialog] = useState(false);
  const [partnerDialog, setPartnerDialog] = useState(false);
  const [editingInst, setEditingInst] = useState<Institution | null>(null);
  const [editingCamp, setEditingCamp] = useState<Campaign | null>(null);
  const [editingLead, setEditingLead] = useState<ScreeningLead | null>(null);
  const [editingPartner, setEditingPartner] = useState<CorporatePartnership | null>(null);
  const [checklistDialog, setChecklistDialog] = useState(false);
  const [checklistCampaign, setChecklistCampaign] = useState<Campaign | null>(null);
  const [selectedCampaignForLeads, setSelectedCampaignForLeads] = useState<string>("");
  const [followupDialog, setFollowupDialog] = useState(false);
  const [selectedLeadForFollowup, setSelectedLeadForFollowup] = useState<ScreeningLead | null>(null);
  const [instDetailDialog, setInstDetailDialog] = useState(false);
  const [detailInstitution, setDetailInstitution] = useState<Institution | null>(null);

  // ===== FILTERS =====
  const [instCategoryFilter, setInstCategoryFilter] = useState("all");
  const [instStatusFilter, setInstStatusFilter] = useState("all");
  const [instSearch, setInstSearch] = useState("");
  const [campStatusFilter, setCampStatusFilter] = useState("all");
  const [leadSearch, setLeadSearch] = useState("");
  const [followupSearch, setFollowupSearch] = useState("");
  const [followupCampaignFilter, setFollowupCampaignFilter] = useState("all");
  const [followupStatusFilter, setFollowupStatusFilter] = useState("all");
  const [leadStatusFilter, setLeadStatusFilter] = useState("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [newLeadIds, setNewLeadIds] = useState<Set<string>>(new Set());
  const [pushedKeys, setPushedKeys] = useState<Set<string>>(new Set());
  const [bulkPushing, setBulkPushing] = useState(false);

  // ===== FORM STATES =====
  const [instForm, setInstForm] = useState<Partial<Institution>>({});
  const [campForm, setCampForm] = useState<Partial<Campaign>>({});
  const [leadForm, setLeadForm] = useState<Partial<ScreeningLead>>({ treatment_tags: [] });
  const [chiefComplaintOther, setChiefComplaintOther] = useState("");
  const [guestDoctorName, setGuestDoctorName] = useState("");
  const [otherDoctorMode, setOtherDoctorMode] = useState(false);
  const [couponForm, setCouponForm] = useState<Partial<CampaignCoupon>>({});

  const [partnerForm, setPartnerForm] = useState<Partial<CorporatePartnership>>({});

  // Doctors assigned to the lead's campaign (clinic doctor multi-select on the campaign)
  const leadCampaign = useMemo(
    () => campaigns.find(c => c.id === leadForm.campaign_id) || null,
    [campaigns, leadForm.campaign_id],
  );
  const isGuestDoctorCampaign = (leadCampaign?.doctor_type ?? "clinic") === "guest";
  const scopedDoctorOptions = useMemo(() => {
    if (!leadCampaign) return doctorOptions;
    const names = isGuestDoctorCampaign
      ? parseDoctorList(leadCampaign.guest_doctor_name)
      : parseDoctorList(leadCampaign.doctor_assigned);
    if (names.length === 0) return doctorOptions;
    return names.map(n => doctorOptions.find(o => o.value === n) || { value: n, label: n });
  }, [leadCampaign, isGuestDoctorCampaign, doctorOptions]);
  const activeDoctorOptions = otherDoctorMode ? doctorOptions : scopedDoctorOptions;

  // Auto-select when the campaign has exactly one assigned doctor and none saved yet
  useEffect(() => {
    if (!leadDialog) return;
    if (leadForm.doctor_name) {
      if (
        !otherDoctorMode &&
        leadForm.doctor_name !== "Guest Doctor" &&
        !scopedDoctorOptions.some(o => o.value === leadForm.doctor_name) &&
        doctorOptions.some(o => o.value === leadForm.doctor_name)
      ) setOtherDoctorMode(true);
      return;
    }
    if (scopedDoctorOptions.length === 1) {
      setLeadForm(f => (f.doctor_name ? f : { ...f, doctor_name: scopedDoctorOptions[0].value }));
    }
  }, [leadDialog, scopedDoctorOptions, isGuestDoctorCampaign, leadForm.doctor_name, otherDoctorMode, doctorOptions]);



  // ===== FETCH ALL DATA =====
  const fetchAll = async () => {
    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      supabase.from("institutions").select("*").order("created_at", { ascending: false }),
      supabase.from("campaigns").select("*, institutions(name)").order("created_at", { ascending: false }),
      supabase.from("screening_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("campaign_coupons").select("*"),
      supabase.from("campaign_followups").select("*").order("scheduled_date", { ascending: true }),
      supabase.from("corporate_partnerships").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("phone, meta_form_name").eq("source", "Offline Camp"),
    ]);
    if (r1.data) setInstitutions(r1.data as Institution[]);
    if (r2.data) setCampaigns(r2.data as Campaign[]);
    if (r3.data) setScreeningLeads(r3.data as ScreeningLead[]);
    if (r4.data) setCoupons(r4.data as CampaignCoupon[]);
    if (r5.data) setFollowups(r5.data as CampaignFollowup[]);
    if (r6.data) setPartnerships(r6.data as CorporatePartnership[]);
    if (r7.data) setPushedKeys(new Set(r7.data.map((l: any) => `${l.phone}|${l.meta_form_name}`)));
  };

  useEffect(() => { fetchAll(); }, []);

  // ===== REALTIME: new screening leads (incl. QR self-registrations) =====
  useEffect(() => {
    const channel = supabase
      .channel("screening-leads-inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "screening_leads" }, (payload) => {
        const row = payload.new as ScreeningLead;
        setScreeningLeads(prev => (prev.some(l => l.id === row.id) ? prev : [row, ...prev]));
        setNewLeadIds(prev => new Set(prev).add(row.id));
        setTimeout(() => {
          setNewLeadIds(prev => { const n = new Set(prev); n.delete(row.id); return n; });
        }, 4000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ===== FOLLOW-UP FILTERS =====
  const campaignOptions = useMemo(() => {
    return campaigns.map((c) => {
      const instName = c.institutions?.name || institutions.find((i) => i.id === c.institution_id)?.name;
      return { value: c.id, label: `${c.name}${instName ? ` — ${instName}` : ""}` };
    });
  }, [campaigns, institutions]);

  const filteredFollowups = useMemo(() => {
    const term = followupSearch.trim().toLowerCase();
    return followups.filter((fu) => {
      const lead = screeningLeads.find((l) => l.id === fu.lead_id);
      const nameMatch = !term || (lead?.participant_name || "").toLowerCase().includes(term);
      const campaignMatch = followupCampaignFilter === "all" || fu.campaign_id === followupCampaignFilter;
      const statusMatch = followupStatusFilter === "all" || fu.status === followupStatusFilter;
      return nameMatch && campaignMatch && statusMatch;
    });
  }, [followups, screeningLeads, followupSearch, followupCampaignFilter, followupStatusFilter]);

  // ===== INSTITUTION CRUD =====
  const saveInstitution = async () => {
    if (!instForm.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    if (editingInst) {
      await supabase.from("institutions").update(instForm).eq("id", editingInst.id);
    } else {
      await supabase.from("institutions").insert(instForm as any);
    }
    setInstDialog(false); setEditingInst(null); setInstForm({}); fetchAll();
    toast({ title: editingInst ? "Institution updated" : "Institution added" });
  };
  const deleteInstitution = async (id: string) => {
    await supabase.from("institutions").delete().eq("id", id);
    fetchAll(); toast({ title: "Institution deleted" });
  };

  // ===== CAMPAIGN CRUD =====
  const saveCampaign = async () => {
    if (!campForm.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    if ((campForm.doctor_type ?? "clinic") === "guest" && parseDoctorList(campForm.guest_doctor_name).length === 0) {
      toast({ title: "Guest doctor name required", variant: "destructive" }); return;
    }
    const payload: any = { ...campForm };
    if ((payload.doctor_type ?? "clinic") === "guest") {
      payload.doctor_assigned = null;
      payload.guest_doctor_name = parseDoctorList(payload.guest_doctor_name).join(", ") || null;
      payload.guest_doctor_contact = splitRawList(payload.guest_doctor_contact).join(", ") || null;
      payload.guest_doctor_specialization = splitRawList(payload.guest_doctor_specialization).join(", ") || null;
    } else {
      payload.doctor_type = "clinic";
      payload.guest_doctor_name = null; payload.guest_doctor_contact = null; payload.guest_doctor_specialization = null;
    }
    if ((payload.assistant_type ?? "clinic") === "guest") {
      payload.assistant_assigned = null;
      payload.guest_assistant_name = splitRawList(payload.guest_assistant_name).join(", ") || null;
      payload.guest_assistant_contact = splitRawList(payload.guest_assistant_contact).join(", ") || null;
    } else {
      payload.assistant_type = "clinic";
      payload.guest_assistant_name = null; payload.guest_assistant_contact = null;
    }
    if (editingCamp) {
      await supabase.from("campaigns").update(payload).eq("id", editingCamp.id);
    } else {
      payload.qr_enabled = true;
      await supabase.from("campaigns").insert(payload);
    }
    setCampDialog(false); setEditingCamp(null); setCampForm({}); fetchAll();
    toast({ title: editingCamp ? "Campaign updated" : "Campaign created" });
  };
  const deleteCampaign = async (id: string) => {
    await supabase.from("campaigns").delete().eq("id", id);
    fetchAll(); toast({ title: "Campaign deleted" });
  };
  const toggleCampaignQr = async (camp: Campaign, enabled: boolean) => {
    const { error } = await supabase.from("campaigns").update({ qr_enabled: enabled }).eq("id", camp.id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: enabled ? "QR enabled" : "QR disabled" });
    fetchAll();
  };

  // ===== CHECKLIST =====
  const updateChecklist = async (camp: Campaign, key: string, val: boolean) => {
    const updated = { ...camp.checklist, [key]: val };
    await supabase.from("campaigns").update({ checklist: updated }).eq("id", camp.id);
    fetchAll();
  };
  const getChecklistProgress = (checklist: Record<string, boolean>) => {
    const keys = Object.keys(checklist);
    const done = keys.filter(k => checklist[k]).length;
    return Math.round((done / keys.length) * 100);
  };

  // ===== SCREENING LEAD CRUD =====
  const saveLead = async () => {
    if (!leadForm.participant_name || !leadForm.campaign_id) { toast({ title: "Name and Campaign required", variant: "destructive" }); return; }
    const camp = campaigns.find(c => c.id === leadForm.campaign_id);
    const inst = camp?.institution_id ? institutions.find(i => i.id === camp.institution_id) : null;
    const complaintList = (leadForm.chief_complaints || []).flatMap(c =>
      c === "Other" ? (chiefComplaintOther.trim() ? [chiefComplaintOther.trim()] : []) : [c],
    );
    const chiefComplaint = complaintList.join(", ");
    const doctorName = leadForm.doctor_name === "Guest Doctor" ? (guestDoctorName.trim() || "Guest Doctor") : leadForm.doctor_name;
    const isScreenedNow = !!(doctorName && doctorName.trim()) || (leadForm.treatment_tags || []).length > 0 || !!leadForm.interested_in_visit;
    const data = { ...leadForm, chief_complaint: chiefComplaint, chief_complaints: complaintList, doctor_name: doctorName, institution_name: inst?.name || leadForm.institution_name || "", ...(isScreenedNow ? { screened: true } : {}) };
    if (editingLead) {
      await supabase.from("screening_leads").update(data).eq("id", editingLead.id);
    } else {
      await supabase.from("screening_leads").insert(data as any);
    }
    setLeadDialog(false); setEditingLead(null); setLeadForm({ treatment_tags: [], chief_complaints: [] }); setChiefComplaintOther(""); setGuestDoctorName(""); fetchAll();

    toast({ title: editingLead ? "Lead updated" : "Lead captured" });
  };

  const deleteLead = async (id: string) => {
    await supabase.from("screening_leads").delete().eq("id", id);
    fetchAll(); toast({ title: "Lead deleted" });
  };

  // ===== COUPON =====
  const saveCoupon = async () => {
    if (!couponForm.lead_id) return;
    await supabase.from("campaign_coupons").insert(couponForm as any);
    await supabase.from("screening_leads").update({ coupon_issued: true }).eq("id", couponForm.lead_id);
    setCouponDialog(false); setCouponForm({}); fetchAll();
    toast({ title: "Coupon issued" });
  };

  // ===== ISSUE COUPON + SEND VIA WHATSAPP =====
  const issueAndSendCoupon = async (lead: ScreeningLead) => {
    if (!lead.mobile) { toast({ title: "No mobile number for this lead", variant: "destructive" }); return; }
    let coupon = coupons.find(c => c.lead_id === lead.id);
    const camp = campaigns.find(c => c.id === lead.campaign_id);
    const code = coupon?.coupon_code || `CPN-${(lead.unique_code || lead.id.slice(0, 6)).toUpperCase()}`;
    if (!coupon) {
      const { data, error } = await supabase.from("campaign_coupons").insert({
        lead_id: lead.id, campaign_id: lead.campaign_id,
        offer_type: "free_consultation", discount_percentage: 20,
        coupon_code: code,
        expiry_date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
      } as any).select().single();
      if (error) { toast({ title: "Failed to create coupon", description: error.message, variant: "destructive" }); return; }
      coupon = data as any;
      await supabase.from("screening_leads").update({ coupon_issued: true }).eq("id", lead.id);
    }
    const treatments = (lead.treatment_tags || []).join(", ") || lead.recommended_treatment || "Dental Consultation";
    const concern = lead.chief_complaint || lead.dental_concern || "-";
    const message =
      `🦷 *Dental Camp Coupon*\n\n` +
      `Dear ${lead.participant_name},\n\n` +
      `Thank you for attending our dental screening at *${lead.institution_name || camp?.name || "our camp"}*.\n\n` +
      `🎟️ *Coupon Code:* ${code}\n` +
      `💰 *Offer:* Free Consultation + ${coupon!.discount_percentage}% OFF on treatment\n` +
      `🩺 *Recommended:* ${treatments}\n` +
      `📝 *Concern Noted:* ${concern}\n` +
      `📅 *Valid Till:* ${coupon!.expiry_date}\n\n` +
      `Show this code at the clinic to redeem.\nBook now to claim your offer!`;
    const phone = lead.mobile.replace(/\D/g, "");
    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;
    window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`, "_blank");
    await supabase.from("campaign_coupons").update({
      sent_via_whatsapp: true, whatsapp_sent_at: new Date().toISOString(),
    }).eq("id", coupon!.id);
    fetchAll();
    toast({ title: "Coupon sent on WhatsApp ✓" });
  };

  // ===== SEND COUPON PDF VIA WHATSAPP (camp_coupon_pdf template) =====
  const sendCouponPdfWhatsApp = async (coupon: CampaignCoupon) => {
    const lead = screeningLeads.find(l => l.id === coupon.lead_id);
    if (!lead?.mobile) { toast({ title: "No mobile number for this lead", variant: "destructive" }); return; }
    setSendingCouponId(coupon.id);
    try {
      let code = coupon.coupon_code;
      if (!code) {
        code = `CPN-${(lead.unique_code || lead.id.slice(0, 6)).toUpperCase()}`;
        await supabase.from("campaign_coupons").update({ coupon_code: code }).eq("id", coupon.id);
      }
      const camp = campaigns.find(c => c.id === coupon.campaign_id);
      const campName = camp?.name || lead.institution_name || "Dental Camp";
      const expiryText = coupon.expiry_date ? format(new Date(coupon.expiry_date), "dd MMM yyyy") : "-";
      const offerText = `${(coupon.offer_type || "offer").replace(/_/g, " ")}${coupon.discount_percentage ? ` + ${coupon.discount_percentage}% OFF` : ""}`;

      // Approved Meta template: camp_coupon_pdf
      // {{1}} name · {{2}} coupon code · {{3}} camp name · {{4}} offer · {{5}} expiry
      const res = await sendClinicWhatsApp({
        patient: { name: lead.participant_name, phone: lead.mobile },
        templateKey: "camp_coupon_pdf",
        bodyParams: [
          lead.participant_name || "Customer",
          code,
          campName,
          offerText,
          expiryText,
        ],
        label: "Coupon PDF",
        context: {
          module: "marketing",
          messageKind: "camp_coupon_pdf",
          campaignId: coupon.campaign_id ?? null,
        },

        fallbackText:
          `🦷 Your Dental Camp Coupon\n\nDear ${lead.participant_name},\n🎟️ Coupon Code: ${code}\n🏫 Camp: ${campName}\n💰 Offer: ${offerText}\n📅 Valid Till: ${expiryText}\n\nShow this coupon at the clinic reception to redeem.`,
      });

      if (res.ok) {
        await supabase.from("campaign_coupons").update({
          sent_via_whatsapp: true, whatsapp_sent_at: new Date().toISOString(),
        }).eq("id", coupon.id);
        fetchAll();
      }
    } catch (e: any) {
      console.error("[coupon-whatsapp] send failed", e);
      toast({ title: "Failed to send coupon PDF", description: e?.message, variant: "destructive" });
    } finally {
      setSendingCouponId(null);
    }
  };



  // ===== FOLLOW-UP AUTO-GENERATION =====
  const pushKey = (lead: ScreeningLead) =>
    `${lead.mobile}|${campaigns.find(c => c.id === lead.campaign_id)?.name || "Offline Camp"}`;
  const isPushed = (lead: ScreeningLead) => pushedKeys.has(pushKey(lead));

  const doPushToPipeline = async (lead: ScreeningLead): Promise<"ok" | "dup" | "fail"> => {
    try {
      const campName = campaigns.find(c => c.id === lead.campaign_id)?.name || "Offline Camp";

      // Duplicate guard: same phone + camp already in pipeline
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("phone", lead.mobile)
        .eq("meta_form_name", campName)
        .limit(1);
      if (existing && existing.length > 0) {
        setPushedKeys(prev => new Set(prev).add(pushKey(lead)));
        return "dup";
      }

      const dentalProblem = [lead.chief_complaint, lead.screening_findings].filter(Boolean).join(" — ") || null;
      const { error } = await supabase.from("leads").insert({
        name: lead.participant_name,
        phone: lead.mobile,
        age: lead.age ?? null,
        email: lead.email || null,
        city: lead.institution_name || null,
        dental_problem: dentalProblem,
        treatment_interest: lead.treatment_tags?.[0] || lead.recommended_treatment || "General Consultation",
        source: "Offline Camp",
        meta_form_name: campName,
        status: "new_lead",
        notes: `Screening lead from camp "${campName}"${lead.doctor_name ? ` — Examined by ${lead.doctor_name}` : ""}`,
      } as any);
      if (error) throw error;
      setPushedKeys(prev => new Set(prev).add(pushKey(lead)));
      return "ok";
    } catch {
      return "fail";
    }
  };

  const pushToPipeline = async (lead: ScreeningLead) => {
    if (pushingLeadId) return;
    setPushingLeadId(lead.id);
    const result = await doPushToPipeline(lead);
    setPushingLeadId(null);
    if (result === "ok") {
      toast({ title: "Added to Pipeline", description: `${lead.participant_name} is now in the CRM Pipeline for sales follow-up.` });
    } else if (result === "dup") {
      toast({ title: "Lead already exists in Pipeline", description: `${lead.participant_name} is already in the CRM Pipeline.` });
    } else {
      toast({ title: "Push failed", description: `Could not push ${lead.participant_name} to Pipeline.`, variant: "destructive" });
    }
  };

  const bulkPushToPipeline = async () => {
    if (bulkPushing || selectedLeadIds.size === 0) return;
    setBulkPushing(true);
    let ok = 0, dup = 0, fail = 0;
    for (const id of Array.from(selectedLeadIds)) {
      const lead = screeningLeads.find(l => l.id === id);
      if (!lead || isPushed(lead)) continue;
      const result = await doPushToPipeline(lead);
      if (result === "ok") ok++;
      else if (result === "dup") dup++;
      else fail++;
    }
    setBulkPushing(false);
    setSelectedLeadIds(new Set());
    toast({
      title: "Bulk push complete",
      description: `${ok} added to Pipeline${dup ? `, ${dup} already existed` : ""}${fail ? `, ${fail} failed` : ""}.`,
      variant: fail > 0 && ok === 0 ? "destructive" : "default",
    });
  };

  const generateFollowups = async (lead: ScreeningLead) => {
    const types = [
      { type: "thank_you", days: 1, label: "Day 1 Thank You" },
      { type: "reminder", days: 3, label: "Day 3 Reminder" },
      { type: "appointment_invite", days: 7, label: "Day 7 Appointment Invitation" },
      { type: "offer_expiry", days: 14, label: "Day 14 Offer Expiry Reminder" },
    ];
    const records = types.map(t => ({
      lead_id: lead.id,
      campaign_id: lead.campaign_id,
      followup_type: t.type,
      scheduled_date: format(addDays(new Date(lead.created_at), t.days), "yyyy-MM-dd"),
      status: "pending",
      notes: t.label,
    }));
    await supabase.from("campaign_followups").insert(records);
    fetchAll();
    toast({ title: "Follow-ups generated for " + lead.participant_name });
  };

  // ===== CORPORATE PARTNERSHIP =====
  const savePartnership = async () => {
    if (!partnerForm.company_name) { toast({ title: "Company name required", variant: "destructive" }); return; }
    if (editingPartner) {
      await supabase.from("corporate_partnerships").update(partnerForm).eq("id", editingPartner.id);
    } else {
      await supabase.from("corporate_partnerships").insert(partnerForm as any);
    }
    setPartnerDialog(false); setEditingPartner(null); setPartnerForm({}); fetchAll();
    toast({ title: editingPartner ? "Partnership updated" : "Partnership added" });
  };
  const deletePartnership = async (id: string) => {
    await supabase.from("corporate_partnerships").delete().eq("id", id);
    fetchAll(); toast({ title: "Partnership deleted" });
  };

  // ===== ANALYTICS CALCULATIONS =====
  const totalScreened = screeningLeads.length;
  const totalInterested = screeningLeads.filter(l => l.interested_in_visit).length;
  const totalConverted = screeningLeads.filter(l => l.converted_to_patient).length;
  const conversionRate = totalScreened > 0 ? Math.round((totalConverted / totalScreened) * 100) : 0;
  const activeCampaigns = campaigns.filter(c => c.campaign_status === "planned" || c.campaign_status === "approved").length;
  const completedCampaigns = campaigns.filter(c => c.campaign_status === "completed").length;
  const totalEstimatedCost = campaigns.reduce((s, c) => s + (c.estimated_cost || 0), 0);
  const totalActualCost = campaigns.reduce((s, c) => s + (c.actual_cost || 0), 0);
  const totalRevenue = totalConverted * 5000; // Estimated ₹5000 per converted patient
  const roi = totalActualCost > 0 ? Math.round(((totalRevenue - totalActualCost) / totalActualCost) * 100) : 0;
  const roiLabel = roi < 50 ? "Low ROI" : roi < 100 ? "Moderate ROI" : roi < 200 ? "High ROI" : "Excellent ROI";
  const roiColor = roi < 50 ? "text-red-600" : roi < 100 ? "text-yellow-600" : roi < 200 ? "text-green-600" : "text-emerald-600";

  // ===== FILTERED DATA =====
  const filteredInstitutions = institutions.filter(i => {
    if (instCategoryFilter !== "all" && i.category !== instCategoryFilter) return false;
    if (instStatusFilter !== "all" && i.status !== instStatusFilter) return false;
    if (instSearch && !i.name.toLowerCase().includes(instSearch.toLowerCase()) && !i.area?.toLowerCase().includes(instSearch.toLowerCase())) return false;
    return true;
  });
  const filteredCampaigns = campaigns.filter(c => campStatusFilter === "all" || c.campaign_status === campStatusFilter);
  const filteredLeads = screeningLeads.filter(l => {
    if (selectedCampaignForLeads && l.campaign_id !== selectedCampaignForLeads) return false;
    if (leadSearch) {
      const q = leadSearch.toLowerCase();
      const hit = l.participant_name.toLowerCase().includes(q) ||
        (l.unique_code || "").toLowerCase().includes(q) ||
        (l.mobile || "").includes(q);
      if (!hit) return false;
    }
    if (leadStatusFilter !== "all") {
      const leadCoupon = coupons.find(c => c.lead_id === l.id);
      const statuses: string[] = [];
      if (l.screened === false && l.source === "qr") statuses.push("registered");
      if (l.interested_in_visit) statuses.push("interested");
      if (l.converted_to_patient) statuses.push("converted");
      if (leadCoupon?.sent_via_whatsapp) statuses.push("coupon_sent");
      else if (l.coupon_issued || leadCoupon) statuses.push("coupon_issued");
      if (statuses.length === 0) statuses.push("none");
      if (!statuses.includes(leadStatusFilter)) return false;
    }
    return true;
  });

  const selectableLeads = filteredLeads.filter(l => !isPushed(l));
  const allVisibleSelected = selectableLeads.length > 0 && selectableLeads.every(l => selectedLeadIds.has(l.id));
  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(selectableLeads.map(l => l.id)));
    }
  };
  const toggleLeadSelected = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Campaign type distribution for charts
  const campaignTypeData = ["school", "college", "corporate"].map(t => ({
    name: t.charAt(0).toUpperCase() + t.slice(1),
    count: campaigns.filter(c => c.campaign_type === t).length,
    leads: screeningLeads.filter(l => {
      const camp = campaigns.find(cc => cc.id === l.campaign_id);
      return camp?.campaign_type === t;
    }).length,
  }));

  const tabItems = [
    { value: "ceo-dashboard", label: "CEO Dashboard", icon: LayoutDashboard },
    { value: "institutions", label: "Institutions", icon: Building2 },
    { value: "campaigns", label: "Campaigns", icon: Target },
    { value: "qr", label: "Camp QR", icon: QrCode },
    { value: "leads", label: "Screening Leads", icon: Users },
    { value: "coupons", label: "Coupons", icon: Ticket },
    { value: "followups", label: "Follow-ups", icon: PhoneCall },
    { value: "analytics", label: "Analytics", icon: BarChart3 },
    { value: "partnerships", label: "Corporate", icon: Handshake },
    { value: "roi", label: "ROI", icon: Calculator },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Offline Campaign Management</h1>
          <p className="text-sm text-muted-foreground">Manage dental awareness camps in Schools, Colleges & Corporates</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => {
          toast({ title: "Export coming soon" });
        }}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {tabItems.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1">
              <t.icon className="h-3 w-3" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ===== CEO DASHBOARD ===== */}
        <TabsContent value="ceo-dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Active Campaigns", value: activeCampaigns, icon: Target, color: "text-blue-600" },
              { label: "Completed", value: completedCampaigns, icon: Check, color: "text-green-600" },
              { label: "Total Screened", value: totalScreened, icon: Users, color: "text-purple-600" },
              { label: "Converted", value: totalConverted, icon: TrendingUp, color: "text-emerald-600" },
              { label: "Conversion Rate", value: `${conversionRate}%`, icon: BarChart3, color: "text-indigo-600" },
              { label: "Campaign Cost", value: `₹${totalActualCost.toLocaleString()}`, icon: IndianRupee, color: "text-orange-600" },
              { label: "Est. Revenue", value: `₹${totalRevenue.toLocaleString()}`, icon: TrendingUp, color: "text-green-600" },
              { label: "Partnerships", value: partnerships.filter(p => p.partner_status === "active").length, icon: Handshake, color: "text-violet-600" },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{s.label}</span>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Campaigns by Type</CardTitle></CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignTypeData}>
                    <XAxis dataKey="name" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" name="Campaigns" radius={[4,4,0,0]} />
                    <Bar dataKey="leads" fill="#10b981" name="Leads" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ROI Overview</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center justify-center h-48">
                <p className={`text-4xl font-bold ${roiColor}`}>{roi}%</p>
                <p className={`text-sm font-medium ${roiColor}`}>{roiLabel}</p>
                <div className="mt-3 w-full max-w-xs">
                  <Progress value={Math.min(roi, 300) / 3} className="h-3" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Cost: ₹{totalActualCost.toLocaleString()} → Revenue: ₹{totalRevenue.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Upcoming Campaigns */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Campaigns</CardTitle></CardHeader>
            <CardContent>
              {campaigns.filter(c => c.campaign_status === "planned" || c.campaign_status === "approved").length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No upcoming campaigns</p>
              ) : (
                <div className="space-y-2">
                  {campaigns.filter(c => c.campaign_status === "planned" || c.campaign_status === "approved").slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.institutions?.name || "No institution"} • {c.campaign_date || "Date TBD"}</p>
                      </div>
                      <Badge className={statusColors[c.campaign_status]}>{c.campaign_status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== INSTITUTIONS ===== */}
        <TabsContent value="institutions" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search..." className="pl-8 w-48 h-9" value={instSearch} onChange={e => setInstSearch(e.target.value)} />
              </div>
              <Select value={instCategoryFilter} onValueChange={setInstCategoryFilter}>
                <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="school">School</SelectItem>
                  <SelectItem value="college">College</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
              <Select value={instStatusFilter} onValueChange={setInstStatusFilter}>
                <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="not_contacted">Not Contacted</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => { setEditingInst(null); setInstForm({ category: "school", status: "not_contacted", decision_maker_level: "medium", contact_person_role: "principal" }); setInstDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Institution
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Coordinator</TableHead>
                    <TableHead>Last Visit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next Follow-up</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstitutions.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No institutions found</TableCell></TableRow>
                  ) : filteredInstitutions.map(inst => (
                    <TableRow key={inst.id} className="cursor-pointer hover:bg-accent/40" onClick={() => { setDetailInstitution(inst); setInstDetailDialog(true); }}>
                      <TableCell className="font-medium">{inst.name}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{inst.category}</Badge></TableCell>
                      <TableCell className="text-sm">{inst.area || "-"}</TableCell>
                      <TableCell>
                        <div className="text-sm">{inst.contact_person_name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{inst.phone || ""}</div>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{inst.contact_person_role || "-"}</TableCell>
                      <TableCell className="text-sm">{inst.assigned_coordinator || "-"}</TableCell>
                      <TableCell className="text-sm">{inst.last_visit_date || "-"}</TableCell>
                      <TableCell><Badge className={statusColors[inst.status] || ""}>{inst.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-sm">{inst.next_followup_date || "-"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="View history" onClick={() => { setDetailInstitution(inst); setInstDetailDialog(true); }}><Eye className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingInst(inst); setInstForm(inst); setInstDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteInstitution(inst.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== CAMPAIGNS ===== */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <Select value={campStatusFilter} onValueChange={setCampStatusFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="planned">Planned</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { setEditingCamp(null); setCampForm({ campaign_type: "school", objective: "awareness", campaign_status: "planned", approval_status: "pending", estimated_cost: 0, actual_cost: 0, expected_participants: 0, checklist: { permission_letter_sent: false, approval_received: false, doctor_assigned: false, assistant_assigned: false, educational_materials_prepared: false, screening_forms_ready: false, coupons_printed: false, feedback_forms_ready: false, transport_arranged: false } }); setCampDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Create Campaign
            </Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="table-fixed w-full min-w-[1230px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[18%] whitespace-nowrap overflow-hidden text-ellipsis">Campaign</TableHead>
                    <TableHead className="w-[15%] whitespace-nowrap overflow-hidden text-ellipsis">Institution</TableHead>
                    <TableHead className="w-[9%] whitespace-nowrap overflow-hidden text-ellipsis">Date</TableHead>
                    <TableHead className="w-[10%] whitespace-nowrap overflow-hidden text-ellipsis text-right">Participants</TableHead>
                    <TableHead className="w-[17%] whitespace-nowrap overflow-hidden text-ellipsis">Financials & Progress</TableHead>
                    <TableHead className="w-[11%] whitespace-nowrap overflow-hidden text-ellipsis">Doctor</TableHead>
                    <TableHead className="w-[7%] whitespace-nowrap overflow-hidden text-ellipsis">Status</TableHead>
                    <TableHead className="w-[9%] whitespace-nowrap overflow-hidden text-ellipsis">QR</TableHead>
                    <TableHead className="w-[4%] whitespace-nowrap overflow-hidden text-ellipsis">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCampaigns.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No campaigns found</TableCell></TableRow>
                  ) : filteredCampaigns.map(camp => {
                    const campLeads = screeningLeads.filter(l => l.campaign_id === camp.id).length;
                    return (
                      <TableRow key={camp.id}>
                        <TableCell className="align-top overflow-hidden">
                          <div className="flex gap-2.5">
                            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex flex-col gap-1 min-w-0">
                              <span className="font-semibold text-sm leading-tight line-clamp-2">{camp.name}</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className="capitalize text-[10px]">{camp.campaign_type}</Badge>
                                <Badge variant="secondary" className="text-[10px]">{campLeads} leads</Badge>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top overflow-hidden">
                          <div className="flex items-start gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <span className="text-sm">{camp.institutions?.name || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap align-top overflow-hidden">
                          {camp.campaign_date ? format(new Date(`${camp.campaign_date}T00:00:00`), "dd MMM yyyy") : "-"}
                        </TableCell>
                        <TableCell className="align-top text-right overflow-hidden">
                          <div className="inline-flex items-center gap-1.5 text-sm">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span>{camp.expected_participants ?? 0}</span>
                            <span className="text-muted-foreground text-xs">students</span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top overflow-hidden">
                          <div className="space-y-2 min-w-0">
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                              <span>Est: ₹{(camp.estimated_cost || 0).toLocaleString()}</span>
                              <span>Actual: ₹{(camp.actual_cost || 0).toLocaleString()}</span>
                            </div>
                            {camp.checklist && (
                              <div className="flex items-center gap-2">
                                <Progress value={getChecklistProgress(camp.checklist)} className="h-1.5 flex-1" />
                                <span className="text-[10px] text-muted-foreground">{getChecklistProgress(camp.checklist)}%</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm align-top overflow-hidden">
                          {(() => {
                            const isGuest = camp.doctor_type === "guest";
                            const names = parseDoctorList(isGuest ? camp.guest_doctor_name : camp.doctor_assigned);
                            if (names.length === 0) return "-";
                            return (
                              <span className="inline-flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{names[0]}</span>
                                {names.length > 1 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <button type="button" className="text-[10px] text-primary underline shrink-0" title={names.join(", ")}>+{names.length - 1} more</button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-2 text-xs">
                                      <div className="space-y-1">{names.map(n => <div key={n}>{n}</div>)}</div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                                <Badge className={isGuest ? "bg-orange-100 text-orange-700 text-[10px] shrink-0" : "bg-blue-100 text-blue-700 text-[10px] shrink-0"}>{isGuest ? "Guest" : "Clinic"}</Badge>
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="align-top overflow-hidden">
                          <Badge className={`${statusColors[camp.campaign_status]} gap-1 text-[10px]`}>
                            {camp.campaign_status === "completed" && <Check className="h-3 w-3" />}
                            {camp.campaign_status === "planned" && <Clock className="h-3 w-3" />}
                            {camp.campaign_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <Switch
                              className="scale-75 origin-left"
                              checked={!!camp.qr_enabled}
                              onCheckedChange={(v) => toggleCampaignQr(camp, v)}
                            />
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                              disabled={!camp.qr_enabled}
                              title="View QR"
                              onClick={() => setQrViewCamp(camp)}
                            >
                              <QrCode className="h-3.5 w-3.5" />
                            </Button>
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                              <Users className="h-3 w-3" />{screeningLeads.filter(l => l.campaign_id === camp.id && l.source === "qr").length}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top overflow-hidden">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditingCamp(camp); setCampForm(camp); setCampDialog(true); }}><Pencil className="h-3.5 w-3.5 mr-2" /> Edit</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteCampaign(camp.id)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Delete</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <CampQRViewDialog campaign={qrViewCamp} onClose={() => setQrViewCamp(null)} />
        </TabsContent>

        {/* ===== CAMP QR ===== */}
        <TabsContent value="qr" className="space-y-4">
          <CampQRTab />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name / Unique ID / mobile..." className="pl-8 w-64 h-9" value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
              </div>
              <Select value={selectedCampaignForLeads} onValueChange={setSelectedCampaignForLeads}>
                <SelectTrigger className="w-48 h-9"><SelectValue placeholder="All Campaigns" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="registered">Registered</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="coupon_sent">Coupon Sent</SelectItem>
                  <SelectItem value="coupon_issued">Coupon Issued</SelectItem>
                  <SelectItem value="none">No Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              {selectedLeadIds.size > 0 && (
                <Button size="sm" variant="outline" disabled={bulkPushing} onClick={bulkPushToPipeline}>
                  {bulkPushing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TrendingUp className="h-4 w-4 mr-1" />}
                  Push Selected to Pipeline ({selectedLeadIds.size})
                </Button>
              )}
              <Button size="sm" onClick={() => { setEditingLead(null); setChiefComplaintOther(""); setOtherDoctorMode(false); setLeadForm({ treatment_tags: [], chief_complaints: [], priority_level: "normal", gender: "male", followup_status: "pending", campaign_id: selectedCampaignForLeads !== "all" ? selectedCampaignForLeads : "" }); setLeadDialog(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Capture Lead
              </Button>
            </div>

          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                 <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={toggleSelectAll}
                        disabled={selectableLeads.length === 0}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Age/Gender</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Doctor</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No leads found</TableCell></TableRow>
                  ) : filteredLeads.map(lead => (
                    <TableRow key={lead.id} className={`transition-colors duration-1000 ${newLeadIds.has(lead.id) ? "bg-emerald-100/70" : ""}`}>
                      <TableCell>
                        {isPushed(lead) ? (
                          <span title="Already in Pipeline"><CheckCheck className="h-4 w-4 text-emerald-600" /></span>
                        ) : (
                          <Checkbox
                            checked={selectedLeadIds.has(lead.id)}
                            onCheckedChange={() => toggleLeadSelected(lead.id)}
                            aria-label={`Select ${lead.participant_name}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{lead.participant_name}</span>
                          {(lead as any).unique_code && (
                            <span className="text-[10px] font-mono text-primary">{(lead as any).unique_code}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{lead.age || "-"} / {lead.gender}</TableCell>
                      <TableCell>{lead.mobile || "-"}</TableCell>
                      <TableCell className="text-sm">{lead.institution_name || "-"}</TableCell>
                      <TableCell className="text-sm">{lead.doctor_name || "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-0.5">
                          {(lead.treatment_tags || []).slice(0, 2).map(t => <Badge key={t} variant="outline" className="text-[10px] px-1">{t}</Badge>)}
                          {(lead.treatment_tags || []).length > 2 && <Badge variant="outline" className="text-[10px] px-1">+{lead.treatment_tags.length - 2}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell><Badge className={statusColors[lead.priority_level]}>{lead.priority_level}</Badge></TableCell>
                      <TableCell>
                        {(() => {
                          const leadCoupon = coupons.find(c => c.lead_id === lead.id);
                          const sent = leadCoupon?.sent_via_whatsapp;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {lead.interested_in_visit && <Badge className="bg-green-100 text-green-700 text-[10px]">Interested</Badge>}
                              {lead.converted_to_patient && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Converted</Badge>}
                              {sent ? (
                                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-0.5"><CheckCheck className="h-3 w-3" /> Coupon Sent</Badge>
                              ) : lead.coupon_issued || leadCoupon ? (
                                <Badge className="bg-orange-100 text-orange-700 text-[10px]">Coupon Issued</Badge>
                              ) : null}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit / Send Coupon" onClick={() => {
                            setEditingLead(lead);
                            const cc = lead.chief_complaint || "";
                            const stored = (lead.chief_complaints && lead.chief_complaints.length)
                              ? lead.chief_complaints
                              : cc.split(",").map(s => s.trim()).filter(Boolean);
                            const known = stored.filter(s => CHIEF_COMPLAINT_OPTIONS.includes(s));
                            const custom = stored.filter(s => !CHIEF_COMPLAINT_OPTIONS.includes(s));
                            setChiefComplaintOther(custom.join(", "));
                            setLeadForm({ ...lead, chief_complaints: custom.length ? [...known, "Other"] : known });

                            setOtherDoctorMode(false);
                            setLeadDialog(true);
                          }}><Pencil className="h-3 w-3" /></Button>

                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => deleteLead(lead.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== COUPONS ===== */}
        <TabsContent value="coupons" className="space-y-4">
          {(() => {
            const offerTypes = Array.from(new Set(coupons.map(c => c.offer_type).filter(Boolean)));
            const filtered = coupons.filter(c => {
              if (couponStatusFilter === "redeemed" && !c.redeemed) return false;
              if (couponStatusFilter === "pending" && c.redeemed) return false;
              if (couponOfferFilter !== "all" && c.offer_type !== couponOfferFilter) return false;
              return true;
            });
            return (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
                  <CardTitle className="text-sm">Coupon Tracking</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={couponStatusFilter} onValueChange={setCouponStatusFilter}>
                      <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="redeemed">Redeemed</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={couponOfferFilter} onValueChange={setCouponOfferFilter}>
                      <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Offer Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Offer Types</SelectItem>
                        {offerTypes.map(t => (
                          <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coupon Code</TableHead>
                        <TableHead>Lead</TableHead>
                        <TableHead>Offer Type</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Redeemed On</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          {coupons.length === 0 ? "No coupons issued yet" : "No coupons match the selected filters"}
                        </TableCell></TableRow>
                      ) : filtered.map(c => {
                        const lead = screeningLeads.find(l => l.id === c.lead_id);
                        const code = c.coupon_code || `CPN-${(lead?.unique_code || c.lead_id.slice(0, 6)).toUpperCase()}`;
                        return (
                          <TableRow key={c.id}>
                            <TableCell><span className="font-mono text-xs font-semibold tracking-wide">{code}</span></TableCell>
                            <TableCell className="font-medium">{lead?.participant_name || "-"}</TableCell>
                            <TableCell className="capitalize">{(c.offer_type || "").replace(/_/g, " ")}</TableCell>
                            <TableCell>{c.discount_percentage}%</TableCell>
                            <TableCell>{c.expiry_date ? format(new Date(c.expiry_date), "dd MMM yyyy") : "-"}</TableCell>
                            <TableCell>
                              <Badge className={c.redeemed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                                {c.redeemed ? "Redeemed" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.redeemed && c.redeemed_date ? format(new Date(c.redeemed_date), "dd MMM yyyy") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                  disabled={sendingCouponId === c.id}
                                  onClick={() => sendCouponPdfWhatsApp(c)}>
                                  <FileText className="h-3 w-3" />
                                  {sendingCouponId === c.id ? "Sending..." : "Send WhatsApp PDF"}
                                </Button>
                                {!c.redeemed && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => {
                                    await supabase.from("campaign_coupons").update({ redeemed: true, redeemed_date: format(new Date(), "yyyy-MM-dd") }).eq("id", c.id);
                                    fetchAll(); toast({ title: "Coupon redeemed" });
                                  }}>
                                    Redeem
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>


        {/* ===== FOLLOW-UPS ===== */}
        <TabsContent value="followups" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Follow-up Timeline</CardTitle></CardHeader>
            <CardContent>
              {followups.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No follow-ups generated yet. Go to Leads tab and click the phone icon to generate.</p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search patient name..."
                        className="pl-9 h-9 text-sm"
                        value={followupSearch}
                        onChange={(e) => setFollowupSearch(e.target.value)}
                      />
                    </div>
                    <Select value={followupCampaignFilter} onValueChange={setFollowupCampaignFilter}>
                      <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm">
                        <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Campaign/Institution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Campaigns</SelectItem>
                        {campaignOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={followupStatusFilter} onValueChange={setFollowupStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {filteredFollowups.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No follow-ups match the selected filters.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredFollowups.map((fu) => {
                        const lead = screeningLeads.find((l) => l.id === fu.lead_id);
                        const campaign = campaigns.find((c) => c.id === fu.campaign_id);
                        const timestamp = fu.sent_at
                          ? new Date(fu.sent_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : `Scheduled: ${fu.scheduled_date}`;
                        const activity = fu.notes || fu.followup_type || "Follow-up";
                        const isPending = fu.status === "pending";
                        const isSent = fu.status === "sent";
                        const rowBg = isPending ? "bg-amber-50/70 border border-amber-100" : "bg-muted/50";
                        const dotClass = isPending ? "bg-amber-500" : isSent ? "bg-blue-500" : fu.status === "completed" ? "bg-green-500" : "bg-gray-400";
                        return (
                          <div key={fu.id} className={`flex items-center gap-3 p-3 rounded-lg ${rowBg}`}>
                            <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate text-foreground">
                                {lead?.participant_name || "Unknown"}
                                {(lead?.institution_name || campaign?.name) && (
                                  <span className="text-xs text-muted-foreground font-normal"> — {lead?.institution_name || campaign?.name}</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{activity} • {timestamp}</p>
                            </div>
                            <Badge className={statusColors[fu.status] || "bg-gray-100 text-gray-700"}>{fu.status}</Badge>
                            {isPending && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                                const sentAt = new Date().toISOString();
                                // Optimistic local update — no full refetch
                                setFollowups((prev) => prev.map((f) => f.id === fu.id ? { ...f, status: "sent", sent_at: sentAt } : f));
                                toast({ title: "Marked as sent" });
                                supabase.from("campaign_followups").update({ status: "sent", sent_at: sentAt }).eq("id", fu.id)
                                  .then(({ error }) => { if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" }); });
                              }}>
                                Mark Sent
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ANALYTICS ===== */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Screened", value: totalScreened },
              { label: "Interested", value: totalInterested },
              { label: "Converted", value: totalConverted },
              { label: "Conversion %", value: `${conversionRate}%` },
              { label: "Coupons Issued", value: screeningLeads.filter(l => l.coupon_issued).length },
              { label: "Coupons Redeemed", value: coupons.filter(c => c.redeemed).length },
              { label: "Revenue/Campaign", value: `₹${completedCampaigns > 0 ? Math.round(totalRevenue / completedCampaigns).toLocaleString() : 0}` },
              { label: "Revenue/Lead", value: `₹${totalConverted > 0 ? Math.round(totalRevenue / totalConverted).toLocaleString() : 0}` },
            ].map((s, i) => (
              <Card key={i}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Leads by Campaign Type</CardTitle></CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={campaignTypeData.filter(d => d.leads > 0)} dataKey="leads" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                      {campaignTypeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Campaign Performance</CardTitle></CardHeader>
              <CardContent className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaigns.filter(c => c.campaign_status === "completed").slice(0, 6).map(c => ({
                    name: c.name.slice(0, 15),
                    leads: screeningLeads.filter(l => l.campaign_id === c.id).length,
                    converted: screeningLeads.filter(l => l.campaign_id === c.id && l.converted_to_patient).length,
                  }))}>
                    <XAxis dataKey="name" fontSize={10} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="leads" fill="#6366f1" name="Leads" radius={[4,4,0,0]} />
                    <Bar dataKey="converted" fill="#10b981" name="Converted" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CORPORATE PARTNERSHIPS ===== */}
        <TabsContent value="partnerships" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditingPartner(null); setPartnerForm({ partner_status: "prospect", visit_frequency: "quarterly" }); setPartnerDialog(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Partnership
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Insurance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Contract End</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnerships.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No partnerships yet</TableCell></TableRow>
                  ) : partnerships.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.company_name}</TableCell>
                      <TableCell>{p.annual_dental_package ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-gray-400" />}</TableCell>
                      <TableCell>{p.employee_coverage_count}</TableCell>
                      <TableCell className="capitalize">{p.visit_frequency}</TableCell>
                      <TableCell>{p.insurance_supported ? <Check className="h-4 w-4 text-green-600" /> : <X className="h-4 w-4 text-gray-400" />}</TableCell>
                      <TableCell><Badge className={statusColors[p.partner_status] || ""}>{p.partner_status}</Badge></TableCell>
                      <TableCell className="text-sm">{p.contract_renewal_date || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingPartner(p); setPartnerForm(p); setPartnerDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePartnership(p.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ROI CALCULATOR ===== */}
        <TabsContent value="roi" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Total Campaign Cost</p>
                <p className="text-3xl font-bold text-orange-600">₹{totalActualCost.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">Est. Revenue Generated</p>
                <p className="text-3xl font-bold text-green-600">₹{totalRevenue.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">ROI Percentage</p>
                <p className={`text-3xl font-bold ${roiColor}`}>{roi}%</p>
                <Badge className={`mt-2 ${roi < 50 ? "bg-red-100 text-red-700" : roi < 100 ? "bg-yellow-100 text-yellow-700" : roi < 200 ? "bg-green-100 text-green-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {roiLabel}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Per-campaign ROI */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Campaign-wise ROI</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Converted</TableHead>
                    <TableHead>Est. Revenue</TableHead>
                    <TableHead>ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(c => {
                    const cLeads = screeningLeads.filter(l => l.campaign_id === c.id);
                    const cConverted = cLeads.filter(l => l.converted_to_patient).length;
                    const cRevenue = cConverted * 5000;
                    const cRoi = (c.actual_cost || 0) > 0 ? Math.round(((cRevenue - (c.actual_cost || 0)) / (c.actual_cost || 1)) * 100) : 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="capitalize">{c.campaign_type}</TableCell>
                        <TableCell>₹{(c.actual_cost || 0).toLocaleString()}</TableCell>
                        <TableCell>{cLeads.length}</TableCell>
                        <TableCell>{cConverted}</TableCell>
                        <TableCell>₹{cRevenue.toLocaleString()}</TableCell>
                        <TableCell><Badge className={cRoi < 50 ? "bg-red-100 text-red-700" : cRoi < 100 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>{cRoi}%</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InstitutionDetailDialog
        open={instDetailDialog}
        onOpenChange={setInstDetailDialog}
        institution={detailInstitution}
        onUpdated={fetchAll}
      />

      {/* ===== INSTITUTION DIALOG ===== */}
      <Dialog open={instDialog} onOpenChange={setInstDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingInst ? "Edit Institution" : "Add Institution"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={instForm.name || ""} onChange={e => setInstForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Category</Label>
                <Select value={instForm.category || "school"} onValueChange={v => setInstForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="school">School</SelectItem><SelectItem value="college">College</SelectItem><SelectItem value="corporate">Corporate</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Address</Label><Input value={instForm.address || ""} onChange={e => setInstForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Area / Location</Label><Input value={instForm.area || ""} onChange={e => setInstForm(f => ({ ...f, area: e.target.value }))} /></div>
              <div><Label>Contact Person</Label><Input value={instForm.contact_person_name || ""} onChange={e => setInstForm(f => ({ ...f, contact_person_name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label>
                <Select value={instForm.contact_person_role || "principal"} onValueChange={v => setInstForm(f => ({ ...f, contact_person_role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="principal">Principal</SelectItem><SelectItem value="hr">HR</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Decision Maker Level</Label>
                <Select value={instForm.decision_maker_level || "medium"} onValueChange={v => setInstForm(f => ({ ...f, decision_maker_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Phone</Label><Input value={instForm.phone || ""} onChange={e => setInstForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label>Email</Label><Input value={instForm.email || ""} onChange={e => setInstForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Status</Label>
                <Select value={instForm.status || "not_contacted"} onValueChange={v => setInstForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_contacted">Not Contacted</SelectItem><SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem><SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem><SelectItem value="partner">Partner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Coordinator</Label><Input value={instForm.assigned_coordinator || ""} onChange={e => setInstForm(f => ({ ...f, assigned_coordinator: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Last Visit Date</Label><Input type="date" value={instForm.last_visit_date || ""} onChange={e => setInstForm(f => ({ ...f, last_visit_date: e.target.value }))} /></div>
              <div><Label>Next Follow-up</Label><Input type="date" value={instForm.next_followup_date || ""} onChange={e => setInstForm(f => ({ ...f, next_followup_date: e.target.value }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={instForm.notes || ""} onChange={e => setInstForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={saveInstitution}>{editingInst ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CAMPAIGN DIALOG ===== */}
      <Dialog open={campDialog} onOpenChange={setCampDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingCamp ? "Edit Campaign" : "Create Campaign"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Campaign Name *</Label><Input value={campForm.name || ""} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label>
                <Select value={campForm.campaign_type || "school"} onValueChange={v => setCampForm(f => ({ ...f, campaign_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="school">School</SelectItem><SelectItem value="college">College</SelectItem><SelectItem value="corporate">Corporate</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Linked Institution</Label>
                <Select value={campForm.institution_id || ""} onValueChange={v => setCampForm(f => ({ ...f, institution_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{institutions.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Date</Label><Input type="date" value={campForm.campaign_date || ""} onChange={e => setCampForm(f => ({ ...f, campaign_date: e.target.value }))} /></div>
              <div><Label>Objective</Label>
                <Select value={campForm.objective || "awareness"} onValueChange={v => setCampForm(f => ({ ...f, objective: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="awareness">Awareness</SelectItem><SelectItem value="screening">Screening</SelectItem><SelectItem value="lead_generation">Lead Generation</SelectItem><SelectItem value="conversion">Conversion</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Expected Participants</Label><Input type="number" value={campForm.expected_participants || 0} onChange={e => setCampForm(f => ({ ...f, expected_participants: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Status</Label>
                <Select value={campForm.campaign_status || "planned"} onValueChange={v => setCampForm(f => ({ ...f, campaign_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="planned">Planned</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Doctor</Label>
              <div className="flex gap-2 mb-2 mt-1">
                {(["clinic", "guest"] as const).map(t => (
                  <Button key={t} type="button" size="sm" variant={(campForm.doctor_type ?? "clinic") === t ? "default" : "outline"} className="h-7 text-xs"
                    onClick={() => setCampForm(f => ({ ...f, doctor_type: t }))}>
                    {t === "clinic" ? "Clinic Doctor" : "Guest Doctor"}
                  </Button>
                ))}
              </div>
              {(campForm.doctor_type ?? "clinic") === "clinic" ? (
                (() => {
                  const selected = parseDoctorList(campForm.doctor_assigned);
                  return (
                    <div className="grid gap-2">
                      <Select value="" onValueChange={v => setCampForm(f => {
                        const cur = parseDoctorList(f.doctor_assigned);
                        return { ...f, doctor_assigned: (cur.includes(v) ? cur : [...cur, v]).join(", ") };
                      })}>
                        <SelectTrigger><SelectValue placeholder={selected.length ? `${selected.length} selected` : "Select"} /></SelectTrigger>
                        <SelectContent>{doctorOptions.map(d => (
                          <SelectItem key={d.value} value={d.label}>
                            {selected.includes(d.label) ? "✓ " : ""}{d.label}
                          </SelectItem>
                        ))}</SelectContent>
                      </Select>
                      {selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selected.map(n => (
                            <Badge key={n} variant="secondary" className="text-[11px] gap-1">
                              {n}
                              <button type="button" onClick={() => setCampForm(f => ({ ...f, doctor_assigned: parseDoctorList(f.doctor_assigned).filter(x => x !== n).join(", ") }))}>
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const names = splitRawList(campForm.guest_doctor_name);
                  const contacts = splitRawList(campForm.guest_doctor_contact);
                  const specs = splitRawList(campForm.guest_doctor_specialization);
                  const rows = Math.max(1, names.length);
                  const setAt = (arr: string[], i: number, v: string) => { const a = [...arr]; while (a.length < rows) a.push(""); a[i] = v; return a; };
                  const write = (n: string[], c: string[], s: string[]) => setCampForm(f => ({
                    ...f,
                    guest_doctor_name: n.join(", "),
                    guest_doctor_contact: c.join(", "),
                    guest_doctor_specialization: s.join(", "),
                  }));
                  return (
                    <div className="grid gap-3">
                      {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="grid gap-2">
                          <div className="flex gap-2">
                            <Input placeholder="Doctor Name *" value={names[i] || ""} onChange={e => write(setAt(names, i, e.target.value), contacts, specs)} />
                            {rows > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                                onClick={() => write(names.filter((_, x) => x !== i), contacts.filter((_, x) => x !== i), specs.filter((_, x) => x !== i))}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input placeholder="Contact Number" value={contacts[i] || ""} onChange={e => write(names, setAt(contacts, i, e.target.value), specs)} />
                            <Input placeholder="Specialization (optional)" value={specs[i] || ""} onChange={e => write(names, contacts, setAt(specs, i, e.target.value))} />
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="link" size="sm" className="h-6 justify-start px-0 text-xs"
                        onClick={() => write([...(names.length ? names : [""]), ""], contacts, specs)}>
                        + Add Another Guest Doctor
                      </Button>
                    </div>
                  );
                })()
              )}
            </div>
            <div>
              <Label>Assistant</Label>
              <div className="flex gap-2 mb-2 mt-1">
                {(["clinic", "guest"] as const).map(t => (
                  <Button key={t} type="button" size="sm" variant={(campForm.assistant_type ?? "clinic") === t ? "default" : "outline"} className="h-7 text-xs"
                    onClick={() => setCampForm(f => ({ ...f, assistant_type: t }))}>
                    {t === "clinic" ? "Clinic Staff" : "External Assistant"}
                  </Button>
                ))}
              </div>
              {(campForm.assistant_type ?? "clinic") === "clinic" ? (
                (() => {
                  const selected = parseDoctorList(campForm.assistant_assigned);
                  return (
                    <div className="grid gap-2">
                      <Select value="" onValueChange={v => setCampForm(f => {
                        const cur = parseDoctorList(f.assistant_assigned);
                        return { ...f, assistant_assigned: (cur.includes(v) ? cur : [...cur, v]).join(", ") };
                      })}>
                        <SelectTrigger><SelectValue placeholder={selected.length ? `${selected.length} selected` : "Select"} /></SelectTrigger>
                        <SelectContent>{assistants.map(a => (
                          <SelectItem key={a.id} value={a.name}>
                            {selected.includes(a.name) ? "✓ " : ""}{a.name}
                          </SelectItem>
                        ))}</SelectContent>
                      </Select>
                      {selected.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {selected.map(n => (
                            <Badge key={n} variant="secondary" className="text-[11px] gap-1">
                              {n}
                              <button type="button" onClick={() => setCampForm(f => ({ ...f, assistant_assigned: parseDoctorList(f.assistant_assigned).filter(x => x !== n).join(", ") }))}>
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const names = splitRawList(campForm.guest_assistant_name);
                  const contacts = splitRawList(campForm.guest_assistant_contact);
                  const rows = Math.max(1, names.length);
                  const setAt = (arr: string[], i: number, v: string) => { const a = [...arr]; while (a.length < rows) a.push(""); a[i] = v; return a; };
                  const write = (n: string[], c: string[]) => setCampForm(f => ({
                    ...f,
                    guest_assistant_name: n.join(", "),
                    guest_assistant_contact: c.join(", "),
                  }));
                  return (
                    <div className="grid gap-3">
                      {Array.from({ length: rows }).map((_, i) => (
                        <div key={i} className="flex gap-2">
                          <Input placeholder="Assistant Name" value={names[i] || ""} onChange={e => write(setAt(names, i, e.target.value), contacts)} />
                          <Input placeholder="Contact Number" value={contacts[i] || ""} onChange={e => write(names, setAt(contacts, i, e.target.value))} />
                          {rows > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                              onClick={() => write(names.filter((_, x) => x !== i), contacts.filter((_, x) => x !== i))}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="link" size="sm" className="h-6 justify-start px-0 text-xs"
                        onClick={() => write([...(names.length ? names : [""]), ""], contacts)}>
                        + Add Another External Assistant
                      </Button>
                    </div>
                  );
                })()
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Coordinator</Label><Input value={campForm.coordinator_assigned || ""} onChange={e => setCampForm(f => ({ ...f, coordinator_assigned: e.target.value }))} /></div>
              <div><Label>Camp Coordinator Contact Number</Label><Input placeholder="Optional" value={campForm.coordinator_contact || ""} onChange={e => setCampForm(f => ({ ...f, coordinator_contact: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Estimated Cost (₹)</Label><Input type="number" value={campForm.estimated_cost || 0} onChange={e => setCampForm(f => ({ ...f, estimated_cost: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Actual Cost (₹)</Label><Input type="number" value={campForm.actual_cost || 0} onChange={e => setCampForm(f => ({ ...f, actual_cost: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={campForm.notes || ""} onChange={e => setCampForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={saveCampaign}>{editingCamp ? "Update" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== CHECKLIST DIALOG ===== */}
      <Dialog open={checklistDialog} onOpenChange={setChecklistDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pre-Campaign Checklist</DialogTitle></DialogHeader>
          {checklistCampaign && (
            <div className="space-y-3">
              <Progress value={getChecklistProgress(checklistCampaign.checklist)} className="h-3" />
              <p className="text-sm text-center text-muted-foreground">{getChecklistProgress(checklistCampaign.checklist)}% Complete</p>
              {Object.entries(checklistCampaign.checklist).map(([key, val]) => (
                <div key={key} className="flex items-center gap-3">
                  <Checkbox checked={val} onCheckedChange={(checked) => updateChecklist(checklistCampaign, key, !!checked)} />
                  <span className="text-sm capitalize">{key.replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== SCREENING LEAD DIALOG ===== */}
      <Dialog open={leadDialog} onOpenChange={setLeadDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingLead ? "Edit Lead" : "Capture Screening Lead"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Campaign *</Label>
              <Select value={leadForm.campaign_id || ""} onValueChange={v => setLeadForm(f => ({ ...f, campaign_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Campaign" /></SelectTrigger>
                <SelectContent>{campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={leadForm.participant_name || ""} onChange={e => setLeadForm(f => ({ ...f, participant_name: e.target.value }))} /></div>
              <div><Label>Mobile</Label><Input value={leadForm.mobile || ""} onChange={e => setLeadForm(f => ({ ...f, mobile: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Age</Label><Input type="number" value={leadForm.age || ""} onChange={e => setLeadForm(f => ({ ...f, age: parseInt(e.target.value) || null }))} /></div>
              <div><Label>Gender</Label>
                <Select value={leadForm.gender || "male"} onValueChange={v => setLeadForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Dept/Class</Label><Input value={leadForm.department_class || ""} onChange={e => setLeadForm(f => ({ ...f, department_class: e.target.value }))} /></div>
            </div>
            <div>
              <Label>Chief Complaint</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CHIEF_COMPLAINT_OPTIONS.map(opt => (
                  <Badge key={opt} variant={(leadForm.chief_complaints || []).includes(opt) ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => {
                      const cur = leadForm.chief_complaints || [];
                      const next = cur.includes(opt) ? cur.filter(t => t !== opt) : [...cur, opt];
                      if (opt === "Other" && cur.includes(opt)) setChiefComplaintOther("");
                      setLeadForm(f => ({ ...f, chief_complaints: next }));
                    }}>{opt}</Badge>
                ))}
              </div>
              {(leadForm.chief_complaints || []).includes("Other") && (
                <Input className="mt-2" placeholder="Specify chief complaint" value={chiefComplaintOther} onChange={e => setChiefComplaintOther(e.target.value)} />
              )}
            </div>

            <div>
              <Label>Examined By (Doctor)</Label>
              <Select
                value={
                  leadForm.doctor_name === "Guest Doctor"
                    ? "Guest Doctor"
                    : (leadForm.doctor_name && !activeDoctorOptions.some(o => o.value === leadForm.doctor_name))
                      ? "Guest Doctor"
                      : (leadForm.doctor_name || "")
                }
                onValueChange={v => {
                  if (v === "__other_doctor__") {
                    setOtherDoctorMode(true);
                    return;
                  }
                  if (v === "Guest Doctor") {
                    const existing = leadForm.doctor_name && leadForm.doctor_name !== "Guest Doctor" && !doctorOptions.some(o => o.value === leadForm.doctor_name)
                      ? leadForm.doctor_name : "";
                    setGuestDoctorName(existing);
                    setLeadForm(f => ({ ...f, doctor_name: "Guest Doctor" }));
                  } else {
                    setGuestDoctorName("");
                    setLeadForm(f => ({ ...f, doctor_name: v }));
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  {activeDoctorOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  {!otherDoctorMode && scopedDoctorOptions.length < doctorOptions.length && (
                    <SelectItem value="__other_doctor__">+ Other Doctor</SelectItem>
                  )}
                  <SelectItem value="Guest Doctor">Guest Doctor (custom)</SelectItem>
                </SelectContent>
              </Select>
              {leadForm.doctor_name === "Guest Doctor" && (
                <Input className="mt-2" placeholder="Enter guest / visiting doctor name" value={guestDoctorName} onChange={e => setGuestDoctorName(e.target.value)} />
              )}
            </div>
            <div><Label>Screening Findings</Label><Textarea value={leadForm.screening_findings || ""} onChange={e => setLeadForm(f => ({ ...f, screening_findings: e.target.value }))} rows={2} /></div>

            <div>
              <Label>Treatment Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {TREATMENT_TAGS.map(tag => (
                  <Badge key={tag} variant={(leadForm.treatment_tags || []).includes(tag) ? "default" : "outline"} className="cursor-pointer text-xs"
                    onClick={() => {
                      const tags = leadForm.treatment_tags || [];
                      setLeadForm(f => ({ ...f, treatment_tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] }));
                    }}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priority</Label>
                <Select value={leadForm.priority_level || "normal"} onValueChange={v => setLeadForm(f => ({ ...f, priority_level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Follow-up Status</Label>
                <Select value={leadForm.followup_status || "pending"} onValueChange={v => setLeadForm(f => ({ ...f, followup_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="booked">Booked</SelectItem><SelectItem value="visited">Visited</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><Switch checked={leadForm.interested_in_visit || false} onCheckedChange={v => setLeadForm(f => ({ ...f, interested_in_visit: v }))} /><span className="text-sm">Interested in Clinic Visit</span></label>
              <label className="flex items-center gap-2"><Switch checked={leadForm.coupon_issued || false} onCheckedChange={v => setLeadForm(f => ({ ...f, coupon_issued: v }))} /><span className="text-sm">Coupon Issued</span></label>
            </div>
            <label className="flex items-center gap-2"><Switch checked={leadForm.converted_to_patient || false} onCheckedChange={v => setLeadForm(f => ({ ...f, converted_to_patient: v }))} /><span className="text-sm">Converted to Patient</span></label>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-2">
            {editingLead && (() => {
              const leadCoupon = coupons.find(c => c.lead_id === editingLead.id);
              const sent = leadCoupon?.sent_via_whatsapp;
              return (
                <div className="flex flex-1 gap-2 flex-wrap">
                  {leadCoupon && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      title="View coupon details"
                      onClick={() => {
                        const camp = campaigns.find(c => c.id === editingLead.campaign_id);
                        const treatments = (editingLead.treatment_tags || []).join(", ") || editingLead.recommended_treatment || "Dental Consultation";
                        toast({
                          title: `🎟️ ${leadCoupon.coupon_code || "Coupon"}`,
                          description: `${editingLead.participant_name} • ${editingLead.institution_name || camp?.name || ""}\nOffer: Free Consultation + ${leadCoupon.discount_percentage}% OFF\nTreatment: ${treatments}\nValid Till: ${leadCoupon.expiry_date || "—"}\n${sent ? "✓ Sent on WhatsApp " + (leadCoupon.whatsapp_sent_at ? format(new Date(leadCoupon.whatsapp_sent_at), "dd MMM, h:mm a") : "") : "Not yet sent"}`,
                        });
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" /> View Coupon
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={sent ? "outline" : "default"}
                    className={`gap-1 ${sent ? "" : "bg-green-600 hover:bg-green-700 text-white"}`}
                    title={sent ? "Resend coupon on WhatsApp" : "Issue coupon & send on WhatsApp"}
                    onClick={() => issueAndSendCoupon(editingLead)}
                    disabled={!editingLead.mobile}
                  >
                    {sent ? <><CheckCheck className="h-4 w-4" /> Coupon Sent</> : <><MessageCircle className="h-4 w-4" /> Send Coupon on WhatsApp</>}
                  </Button>
                </div>
              );
            })()}
            <Button onClick={saveLead}>{editingLead ? "Update" : "Capture"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== COUPON DIALOG ===== */}
      <Dialog open={couponDialog} onOpenChange={setCouponDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Issue Coupon</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Offer Type</Label>
              <Select value={couponForm.offer_type || "free_consultation"} onValueChange={v => setCouponForm(f => ({ ...f, offer_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="free_consultation">Free Consultation</SelectItem><SelectItem value="discount">Discount</SelectItem><SelectItem value="package">Package</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Discount %</Label><Input type="number" value={couponForm.discount_percentage || 0} onChange={e => setCouponForm(f => ({ ...f, discount_percentage: parseFloat(e.target.value) || 0 }))} /></div>
            <div><Label>Expiry Date</Label><Input type="date" value={couponForm.expiry_date || ""} onChange={e => setCouponForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={saveCoupon}>Issue Coupon</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== PARTNERSHIP DIALOG ===== */}
      <Dialog open={partnerDialog} onOpenChange={setPartnerDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingPartner ? "Edit Partnership" : "Add Corporate Partnership"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Company Name *</Label><Input value={partnerForm.company_name || ""} onChange={e => setPartnerForm(f => ({ ...f, company_name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Employee Coverage</Label><Input type="number" value={partnerForm.employee_coverage_count || 0} onChange={e => setPartnerForm(f => ({ ...f, employee_coverage_count: parseInt(e.target.value) || 0 }))} /></div>
              <div><Label>Visit Frequency</Label>
                <Select value={partnerForm.visit_frequency || "quarterly"} onValueChange={v => setPartnerForm(f => ({ ...f, visit_frequency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem><SelectItem value="half_yearly">Half Yearly</SelectItem><SelectItem value="annually">Annually</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2"><Switch checked={partnerForm.annual_dental_package || false} onCheckedChange={v => setPartnerForm(f => ({ ...f, annual_dental_package: v }))} /><span className="text-sm">Annual Dental Package</span></label>
              <label className="flex items-center gap-2"><Switch checked={partnerForm.insurance_supported || false} onCheckedChange={v => setPartnerForm(f => ({ ...f, insurance_supported: v }))} /><span className="text-sm">Insurance Supported</span></label>
            </div>
            <label className="flex items-center gap-2"><Switch checked={partnerForm.csr_collaboration || false} onCheckedChange={v => setPartnerForm(f => ({ ...f, csr_collaboration: v }))} /><span className="text-sm">CSR Collaboration</span></label>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contract Start</Label><Input type="date" value={partnerForm.contract_start_date || ""} onChange={e => setPartnerForm(f => ({ ...f, contract_start_date: e.target.value }))} /></div>
              <div><Label>Renewal Date</Label><Input type="date" value={partnerForm.contract_renewal_date || ""} onChange={e => setPartnerForm(f => ({ ...f, contract_renewal_date: e.target.value }))} /></div>
            </div>
            <div><Label>Status</Label>
              <Select value={partnerForm.partner_status || "prospect"} onValueChange={v => setPartnerForm(f => ({ ...f, partner_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="prospect">Prospect</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="expired">Expired</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={partnerForm.notes || ""} onChange={e => setPartnerForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={savePartnership}>{editingPartner ? "Update" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OfflineCampaigns;
