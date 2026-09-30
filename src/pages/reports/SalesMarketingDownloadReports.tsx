import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DateRangeFilter, useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { ReportPreviewDialog } from "@/components/reports/ReportPreviewDialog";
import {
  Download, FileSpreadsheet, FileText, Eye, Loader2, GitBranch, CalendarCheck, Phone, Users,
  Building2, Target, Ticket, PhoneCall, Handshake, Share2, Star, MessageSquare, Workflow,
  Instagram, MapPin, Megaphone, IndianRupee, BarChart3, UserCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Which shared filters a card responds to. */
type FilterKind = "stage" | "source" | "platform" | "campaign" | "status";

interface SMReportDef {
  key: string;
  label: string;
  description: string;
  icon: any;
  table: string;
  select: string;
  dateField: string;
  dateIsTimestamp?: boolean;
  filters?: FilterKind[];
  /** Field names used to apply each shared filter on the raw row. */
  filterFields?: Partial<Record<FilterKind, string>>;
  mapRow?: (r: any) => Record<string, any>;
  /** Set for cards that link to a dedicated report page instead of exporting a table. */
  linkTo?: string;
}

const fmt = (val: any, f = "dd MMM yyyy") => {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return format(d, f);
};

const yn = (v: any) => (v === true ? "Yes" : v === false ? "No" : "");

const title = (v: any) =>
  typeof v === "string" ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : (v ?? "");

const REPORTS: SMReportDef[] = [
  {
    key: "pipeline",
    label: "Pipeline (Leads)",
    description: "Flattened lead list with stage, rating, owner, source & campaign",
    icon: GitBranch,
    table: "leads",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["stage", "source"],
    filterFields: { stage: "status", source: "source" },
    select:
      "created_at,name,phone,email,age,city,source,meta_form_name,status,ai_priority,lead_score,estimated_value,treatment_interest,dental_problem,assigned_to_name,follow_up_date,notes",
    mapRow: (r) => ({
      "Created On": fmt(r.created_at),
      Name: r.name ?? "",
      Phone: r.phone ?? "",
      Email: r.email ?? "",
      Age: r.age ?? "",
      Location: r.city ?? "",
      Source: title(r.source),
      Campaign: r.meta_form_name ?? "",
      Stage: title(r.status),
      "Lead Rating": title(r.ai_priority),
      "Lead Score": r.lead_score ?? "",
      "Estimated Value": r.estimated_value ?? 0,
      "Treatment Interest": r.treatment_interest ?? "",
      "Dental Problem": r.dental_problem ?? "",
      Owner: r.assigned_to_name ?? "",
      "Next Follow-up": fmt(r.follow_up_date),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "followups",
    label: "Follow-ups",
    description: "Lead follow-up tasks with due date, status & outcome notes",
    icon: CalendarCheck,
    table: "follow_ups",
    dateField: "due_date",
    filters: ["status"],
    filterFields: { status: "status" },
    select: "due_date,status,note,created_by,created_at,completed_at,updated_by_name,lead:leads(name,phone,status,assigned_to_name)",
    mapRow: (r) => ({
      "Due Date": fmt(r.due_date),
      Lead: r.lead?.name ?? "",
      Phone: r.lead?.phone ?? "",
      "Lead Stage": title(r.lead?.status),
      Owner: r.lead?.assigned_to_name ?? "",
      Status: title(r.status),
      Note: r.note ?? "",
      "Created By": r.created_by ?? "",
      "Created On": fmt(r.created_at),
      "Completed On": fmt(r.completed_at),
      "Last Updated By": r.updated_by_name ?? "",
    }),
  },
  {
    key: "call_logs",
    label: "Call Logs",
    description: "Inbound/outbound calls with duration, status & recording availability",
    icon: Phone,
    table: "call_logs",
    dateField: "started_at",
    dateIsTimestamp: true,
    filters: ["status", "source"],
    filterFields: { status: "status", source: "call_type" },
    select:
      "started_at,ended_at,phone,call_type,status,duration_seconds,source,match_method,recording_path,notes,lead:leads(name,status,assigned_to_name)",
    mapRow: (r) => ({
      "Date & Time": fmt(r.started_at, "dd MMM yyyy, hh:mm a"),
      Phone: r.phone ?? "",
      Lead: r.lead?.name ?? "",
      "Lead Stage": title(r.lead?.status),
      Owner: r.lead?.assigned_to_name ?? "",
      Direction: title(r.call_type),
      Status: title(r.status),
      "Duration (sec)": r.duration_seconds ?? 0,
      Source: title(r.source),
      "Match Method": title(r.match_method),
      Recording: r.recording_path ? "Yes" : "No",
      "Ended At": fmt(r.ended_at, "dd MMM yyyy, hh:mm a"),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "contacts",
    label: "Contacts",
    description: "Contact-shaped list: name, phone, email, location, source & interest",
    icon: Users,
    table: "leads",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["source"],
    filterFields: { source: "source" },
    select: "created_at,name,phone,email,city,source,treatment_interest,assigned_to_name,status",
    mapRow: (r) => ({
      Name: r.name ?? "",
      Phone: r.phone ?? "",
      Email: r.email ?? "",
      Location: r.city ?? "",
      Source: title(r.source),
      "Treatment Interest": r.treatment_interest ?? "",
      Stage: title(r.status),
      Owner: r.assigned_to_name ?? "",
      "Added On": fmt(r.created_at),
    }),
  },
  {
    key: "institutions",
    label: "Institutions",
    description: "Camp institutions with contact person, status & follow-up dates",
    icon: Building2,
    table: "institutions",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "status" },
    select:
      "created_at,name,category,area,address,contact_person_name,contact_person_role,phone,email,decision_maker_level,last_visit_date,next_followup_date,status,assigned_coordinator,notes",
    mapRow: (r) => ({
      Name: r.name ?? "",
      Category: title(r.category),
      Area: r.area ?? "",
      Address: r.address ?? "",
      "Contact Person": r.contact_person_name ?? "",
      Role: r.contact_person_role ?? "",
      Phone: r.phone ?? "",
      Email: r.email ?? "",
      "Decision Maker Level": title(r.decision_maker_level),
      "Last Visit": fmt(r.last_visit_date),
      "Next Follow-up": fmt(r.next_followup_date),
      Status: title(r.status),
      Coordinator: r.assigned_coordinator ?? "",
      "Added On": fmt(r.created_at),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "campaigns",
    label: "Offline Campaigns",
    description: "Camps with cost, participants, team & approval/campaign status (ROI inputs)",
    icon: Target,
    table: "campaigns",
    dateField: "campaign_date",
    filters: ["campaign", "status"],
    filterFields: { campaign: "name", status: "campaign_status" },
    select:
      "campaign_date,camp_code,name,campaign_type,objective,expected_participants,doctor_assigned,guest_doctor_name,assistant_assigned,guest_assistant_name,coordinator_assigned,approval_status,campaign_status,estimated_cost,actual_cost,qr_enabled,notes,institution:institutions(name,area)",
    mapRow: (r) => ({
      "Camp Date": fmt(r.campaign_date),
      "Camp Code": r.camp_code ?? "",
      Name: r.name ?? "",
      Type: title(r.campaign_type),
      Institution: r.institution?.name ?? "",
      Area: r.institution?.area ?? "",
      Objective: r.objective ?? "",
      "Expected Participants": r.expected_participants ?? 0,
      Doctor: r.doctor_assigned ?? r.guest_doctor_name ?? "",
      Assistant: r.assistant_assigned ?? r.guest_assistant_name ?? "",
      Coordinator: r.coordinator_assigned ?? "",
      "Approval Status": title(r.approval_status),
      "Campaign Status": title(r.campaign_status),
      "Estimated Cost": r.estimated_cost ?? 0,
      "Actual Cost": r.actual_cost ?? 0,
      "QR Enabled": yn(r.qr_enabled),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "screening_leads",
    label: "Screening Leads",
    description: "Camp screening records with complaint, doctor, coupon & conversion flags",
    icon: Users,
    table: "screening_leads",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["campaign", "status"],
    filterFields: { status: "followup_status" },
    select:
      "created_at,unique_code,participant_name,mobile,email,age,gender,institution_name,department_class,chief_complaint,chief_complaints,dental_concern,screening_findings,recommended_treatment,treatment_tags,priority_level,interested_in_visit,coupon_issued,followup_status,converted_to_patient,screened,doctor_name,source,campaign:campaigns(name,camp_code)",
    mapRow: (r) => ({
      Date: fmt(r.created_at),
      Code: r.unique_code ?? "",
      Name: r.participant_name ?? "",
      Mobile: r.mobile ?? "",
      Email: r.email ?? "",
      Age: r.age ?? "",
      Gender: title(r.gender),
      Campaign: r.campaign?.name ?? "",
      "Camp Code": r.campaign?.camp_code ?? "",
      Institution: r.institution_name ?? "",
      "Department / Class": r.department_class ?? "",
      "Chief Complaint": Array.isArray(r.chief_complaints) && r.chief_complaints.length
        ? r.chief_complaints.join(", ")
        : (r.chief_complaint ?? r.dental_concern ?? ""),
      "Screening Findings": r.screening_findings ?? "",
      "Recommended Treatment": r.recommended_treatment ?? "",
      "Treatment Tags": Array.isArray(r.treatment_tags) ? r.treatment_tags.join(", ") : (r.treatment_tags ?? ""),
      Priority: title(r.priority_level),
      "Examined By": r.doctor_name ?? "",
      Screened: yn(r.screened),
      "Interested In Visit": yn(r.interested_in_visit),
      "Coupon Issued": yn(r.coupon_issued),
      "Follow-up Status": title(r.followup_status),
      "Converted To Patient": yn(r.converted_to_patient),
      Source: title(r.source),
    }),
  },
  {
    key: "coupons",
    label: "Coupons & Offers",
    description: "Issued coupons with discount, expiry, WhatsApp delivery & redemption",
    icon: Ticket,
    table: "campaign_coupons",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["campaign"],
    select:
      "created_at,coupon_code,offer_type,discount_percentage,expiry_date,redeemed,redeemed_date,sent_via_whatsapp,whatsapp_sent_at,lead:leads(name,phone),campaign:campaigns(name,camp_code)",
    mapRow: (r) => ({
      "Issued On": fmt(r.created_at),
      "Coupon Code": r.coupon_code ?? "",
      Campaign: r.campaign?.name ?? "",
      "Camp Code": r.campaign?.camp_code ?? "",
      Lead: r.lead?.name ?? "",
      Phone: r.lead?.phone ?? "",
      "Offer Type": title(r.offer_type),
      "Discount %": r.discount_percentage ?? 0,
      Expiry: fmt(r.expiry_date),
      Redeemed: yn(r.redeemed),
      "Redeemed On": fmt(r.redeemed_date),
      "Sent On WhatsApp": yn(r.sent_via_whatsapp),
      "WhatsApp Sent At": fmt(r.whatsapp_sent_at, "dd MMM yyyy, hh:mm a"),
    }),
  },
  {
    key: "camp_followups",
    label: "Camp Follow-ups",
    description: "Camp lead follow-ups with channel, schedule & sent status",
    icon: PhoneCall,
    table: "campaign_followups",
    dateField: "scheduled_date",
    filters: ["campaign", "status"],
    filterFields: { status: "status" },
    select: "scheduled_date,followup_type,status,sent_at,notes,lead:leads(name,phone),campaign:campaigns(name,camp_code)",
    mapRow: (r) => ({
      "Scheduled Date": fmt(r.scheduled_date),
      Campaign: r.campaign?.name ?? "",
      "Camp Code": r.campaign?.camp_code ?? "",
      Lead: r.lead?.name ?? "",
      Phone: r.lead?.phone ?? "",
      Channel: title(r.followup_type),
      Status: title(r.status),
      "Sent At": fmt(r.sent_at, "dd MMM yyyy, hh:mm a"),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "partnerships",
    label: "Corporate Partners",
    description: "Corporate tie-ups with package, coverage & contract dates",
    icon: Handshake,
    table: "corporate_partnerships",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "partner_status" },
    select:
      "created_at,company_name,annual_dental_package,employee_coverage_count,visit_frequency,insurance_supported,csr_collaboration,contract_start_date,contract_renewal_date,partner_status,notes",
    mapRow: (r) => ({
      Company: r.company_name ?? "",
      "Annual Package": r.annual_dental_package ?? 0,
      "Employees Covered": r.employee_coverage_count ?? 0,
      "Visit Frequency": title(r.visit_frequency),
      "Insurance Supported": yn(r.insurance_supported),
      "CSR Collaboration": yn(r.csr_collaboration),
      "Contract Start": fmt(r.contract_start_date),
      "Contract Renewal": fmt(r.contract_renewal_date),
      Status: title(r.partner_status),
      "Added On": fmt(r.created_at),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "referrals",
    label: "Referrals",
    description: "Referrer, referred patient, status & attributed revenue",
    icon: Share2,
    table: "referrals",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "status" },
    select:
      "created_at,referral_code,referrer_name,referrer_phone,referred_name,referred_phone,status,reward_type,reward_given,treatment_booked,revenue_generated,converted_at",
    mapRow: (r) => ({
      Date: fmt(r.created_at),
      "Referral Code": r.referral_code ?? "",
      Referrer: r.referrer_name ?? "",
      "Referrer Phone": r.referrer_phone ?? "",
      "Referred Patient": r.referred_name ?? "",
      "Referred Phone": r.referred_phone ?? "",
      Status: title(r.status),
      "Reward Type": title(r.reward_type),
      "Reward Given": yn(r.reward_given),
      "Treatment Booked": r.treatment_booked ?? "",
      "Revenue Attributed": r.revenue_generated ?? 0,
      "Converted On": fmt(r.converted_at),
    }),
  },
  {
    key: "reviews",
    label: "Reviews",
    description: "Review requests sent, received status, rating & platform",
    icon: Star,
    table: "review_requests",
    dateField: "sent_at",
    dateIsTimestamp: true,
    filters: ["status"],
    select: "sent_at,patient_name,phone,review_received,rating,review_platform,reviewed_at,review_text,created_at",
    mapRow: (r) => ({
      "Sent On": fmt(r.sent_at, "dd MMM yyyy, hh:mm a"),
      Patient: r.patient_name ?? "",
      Phone: r.phone ?? "",
      "Review Received": yn(r.review_received),
      Rating: r.rating ?? "",
      Platform: title(r.review_platform),
      "Reviewed On": fmt(r.reviewed_at),
      "Review Text": r.review_text ?? "",
    }),
  },
  {
    key: "wa_campaigns",
    label: "WhatsApp Campaigns",
    description: "Campaign-level recipients, sent, delivered, read & response counts",
    icon: MessageSquare,
    table: "whatsapp_campaigns",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status", "campaign"],
    filterFields: { status: "status", campaign: "name" },
    select:
      "created_at,name,campaign_type,target_segment,total_recipients,sent_count,delivered_count,read_count,response_count,status,scheduled_at,sent_at",
    mapRow: (r) => ({
      "Created On": fmt(r.created_at),
      Campaign: r.name ?? "",
      Type: title(r.campaign_type),
      Segment: title(r.target_segment),
      Recipients: r.total_recipients ?? 0,
      Sent: r.sent_count ?? 0,
      Delivered: r.delivered_count ?? 0,
      Read: r.read_count ?? 0,
      Responses: r.response_count ?? 0,
      Status: title(r.status),
      "Scheduled At": fmt(r.scheduled_at, "dd MMM yyyy, hh:mm a"),
      "Sent At": fmt(r.sent_at, "dd MMM yyyy, hh:mm a"),
    }),
  },
  {
    key: "wa_messages",
    label: "WhatsApp Message Log",
    description: "Message-level log with module, template kind, status & failure reason",
    icon: MessageSquare,
    table: "whatsapp_messages",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "status" },
    select:
      "created_at,direction,status,module,message_kind,send_context,stage_from,stage_to,text,error_code,error_message,sent_at,delivered_at,read_at",
    mapRow: (r) => ({
      "Date & Time": fmt(r.created_at, "dd MMM yyyy, hh:mm a"),
      Direction: title(r.direction),
      Status: title(r.status),
      Module: title(r.module),
      "Message Kind": title(r.message_kind),
      Context: title(r.send_context),
      "Stage From": title(r.stage_from),
      "Stage To": title(r.stage_to),
      Message: (r.text ?? "").slice(0, 300),
      "Error Code": r.error_code ?? "",
      "Error Message": r.error_message ?? "",
      "Sent At": fmt(r.sent_at, "dd MMM yyyy, hh:mm a"),
      "Delivered At": fmt(r.delivered_at, "dd MMM yyyy, hh:mm a"),
      "Read At": fmt(r.read_at, "dd MMM yyyy, hh:mm a"),
    }),
  },
  {
    key: "workflows",
    label: "Automation Workflows",
    description: "Workflow list with trigger, status, contacts entered & completed",
    icon: Workflow,
    table: "workflows",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "status" },
    select: "created_at,name,subtitle,trigger_type,reentry,status,total_contacts,completed,updated_at",
    mapRow: (r) => ({
      "Created On": fmt(r.created_at),
      Workflow: r.name ?? "",
      Subtitle: r.subtitle ?? "",
      Trigger: title(r.trigger_type),
      "Re-entry Allowed": yn(r.reentry),
      Status: title(r.status),
      "Contacts Entered": r.total_contacts ?? 0,
      Completed: r.completed ?? 0,
      "Last Updated": fmt(r.updated_at, "dd MMM yyyy, hh:mm a"),
    }),
  },
  {
    key: "workflow_runs",
    label: "Automation Runs",
    description: "Per-contact workflow runs with current step & status",
    icon: Workflow,
    table: "workflow_runs",
    dateField: "created_at",
    dateIsTimestamp: true,
    filters: ["status"],
    filterFields: { status: "status" },
    select: "created_at,contact_name,contact_phone,step,status,meta_lead_id,workflow:workflows(name,trigger_type)",
    mapRow: (r) => ({
      Date: fmt(r.created_at, "dd MMM yyyy, hh:mm a"),
      Workflow: r.workflow?.name ?? "",
      Trigger: title(r.workflow?.trigger_type),
      Contact: r.contact_name ?? "",
      Phone: r.contact_phone ?? "",
      Step: title(r.step),
      Status: title(r.status),
      "Meta Lead ID": r.meta_lead_id ?? "",
    }),
  },
  {
    key: "content_calendar",
    label: "Content Calendar",
    description: "Planned posts with platform, stage owners & publish status",
    icon: Instagram,
    table: "content_calendar",
    dateField: "scheduled_date",
    filters: ["platform", "status"],
    filterFields: { platform: "platform", status: "status" },
    select:
      "scheduled_date,scheduled_time,title,platform,content_type,category,topic,status,script_status,script_by,shoot_status,shoot_by,edit_status,edit_by,post_status,posted_by,engagement_score,ai_generated,caption,hashtags,remarks",
    mapRow: (r) => ({
      "Scheduled Date": fmt(r.scheduled_date),
      Time: r.scheduled_time ?? "",
      Title: r.title ?? "",
      Platform: title(r.platform),
      "Content Type": title(r.content_type),
      Category: title(r.category),
      Topic: r.topic ?? "",
      Status: title(r.status),
      Script: `${title(r.script_status)}${r.script_by ? ` (${r.script_by})` : ""}`,
      Shoot: `${title(r.shoot_status)}${r.shoot_by ? ` (${r.shoot_by})` : ""}`,
      Edit: `${title(r.edit_status)}${r.edit_by ? ` (${r.edit_by})` : ""}`,
      Post: `${title(r.post_status)}${r.posted_by ? ` (${r.posted_by})` : ""}`,
      "Engagement Score": r.engagement_score ?? "",
      "AI Generated": yn(r.ai_generated),
      Caption: r.caption ?? "",
      Hashtags: Array.isArray(r.hashtags) ? r.hashtags.join(" ") : (r.hashtags ?? ""),
      Remarks: r.remarks ?? "",
    }),
  },
  {
    key: "awareness_content",
    label: "Awareness Content",
    description: "Published content with reach, impressions, engagement & boost spend",
    icon: Megaphone,
    table: "awareness_content",
    dateField: "published_at",
    dateIsTimestamp: true,
    filters: ["platform"],
    filterFields: { platform: "platform" },
    select:
      "published_at,platform,content_format,title,caption,permalink,reach,impressions,likes,comments,shares,enquiries,follower_gain,boost_spend,data_source,notes",
    mapRow: (r) => ({
      "Published On": fmt(r.published_at, "dd MMM yyyy, hh:mm a"),
      Platform: title(r.platform),
      Format: title(r.content_format),
      Title: r.title ?? "",
      Caption: (r.caption ?? "").slice(0, 300),
      Link: r.permalink ?? "",
      Reach: r.reach ?? 0,
      Impressions: r.impressions ?? 0,
      Likes: r.likes ?? 0,
      Comments: r.comments ?? 0,
      Shares: r.shares ?? 0,
      Enquiries: r.enquiries ?? 0,
      "Follower Gain": r.follower_gain ?? 0,
      "Boost Spend": r.boost_spend ?? 0,
      "Data Source": title(r.data_source),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "ad_spend",
    label: "Marketing Ad Spend",
    description: "Entered ad spend per platform & campaign for the selected period",
    icon: IndianRupee,
    table: "marketing_ad_spend",
    dateField: "period_start",
    filters: ["platform", "campaign"],
    filterFields: { platform: "platform", campaign: "campaign_name" },
    select: "period_start,period_end,platform,campaign_name,amount,notes,created_at",
    mapRow: (r) => ({
      "Period Start": fmt(r.period_start),
      "Period End": fmt(r.period_end),
      Platform: title(r.platform),
      Campaign: r.campaign_name ?? "",
      Amount: r.amount ?? 0,
      "Entered On": fmt(r.created_at),
      Notes: r.notes ?? "",
    }),
  },
  {
    key: "local_seo",
    label: "Local SEO Keywords",
    description: "GSC snapshot rankings: query, position, clicks, impressions & CTR",
    icon: MapPin,
    table: "local_seo_snapshots",
    dateField: "range_end",
    select: "range_start,range_end,site_url,gsc_property,totals,rankings",
  },
  {
    key: "lead_generation",
    label: "Lead Generation",
    description: "Full funnel from ad spend to treatment revenue, campaign conversion & ROI metrics",
    icon: BarChart3,
    table: "leads",
    select: "",
    dateField: "created_at",
    dateIsTimestamp: true,
    mapRow: (r) => r,
  },
  {
    key: "lead_awareness",
    label: "Lead Awareness",
    description: "Top-of-funnel brand visibility, reach, impressions, channel and content performance",
    icon: Megaphone,
    table: "awareness_content",
    dateField: "published_at",
    dateIsTimestamp: true,
    filters: ["platform"],
    filterFields: { platform: "platform" },
    select: "published_at,platform,content_format,title,reach,impressions,likes,comments,enquiries",
    mapRow: (r) => ({
      "Published On": fmt(r.published_at, "dd MMM yyyy, hh:mm a"),
      Platform: title(r.platform),
      Format: title(r.content_format),
      Title: r.title ?? "",
      Reach: r.reach ?? 0,
      Impressions: r.impressions ?? 0,
      Likes: r.likes ?? 0,
      Comments: r.comments ?? 0,
      Enquiries: r.enquiries ?? 0,
    }),
  },
  {
    key: "telecaller_periodic",
    label: "Telecaller Periodic",
    description: "Day-wise and hourly call volume, total calls, connected calls, and duration analysis",
    icon: PhoneCall,
    table: "call_logs",
    select: "",
    dateField: "started_at",
    dateIsTimestamp: true,
    mapRow: (r) => r,
  },
  {
    key: "telecaller_employee",
    label: "Telecaller Employee",
    description: "Staff-wise call metrics, connected rates, total talk time, and performance breakdown",
    icon: UserCheck,
    table: "call_logs",
    select: "",
    dateField: "started_at",
    dateIsTimestamp: true,
    mapRow: (r) => r,
  },
];

/** Telecaller aggregates — connected = duration > 0, dates in Asia/Kolkata (same as Periodic Reports). */
const tcHms = (s: number) => {
  const t = Math.round(s);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
async function fetchTelecaller(kind: "periodic" | "employee", from?: Date, to?: Date): Promise<Record<string, any>[]> {
  const sb = supabase as any;
  const calls = await lgAll((f, t) => {
    let q = sb.from("call_logs").select("started_at, duration_seconds, telecaller_id").order("started_at", { ascending: false });
    if (from) q = q.gte("started_at", from.toISOString());
    if (to) q = q.lte("started_at", to.toISOString());
    return q.range(f, t);
  });
  const groups = new Map<string, { total: number; conn: number; dur: number }>();
  const keyOf = (c: any) =>
    kind === "periodic"
      ? new Date(c.started_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      : c.telecaller_id || "unassigned";
  for (const c of calls) {
    const k = keyOf(c);
    const g = groups.get(k) ?? { total: 0, conn: 0, dur: 0 };
    const d = c.duration_seconds || 0;
    g.total++; if (d > 0) g.conn++; g.dur += d;
    groups.set(k, g);
  }
  if (kind === "periodic") {
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, g]) => ({
      "Date / Slot": format(new Date(`${day}T00:00:00`), "EEEE, dd-MMM-yyyy"),
      "Total Calls": g.total,
      "Connected Calls": g.conn,
      "Total Duration": tcHms(g.dur),
      "Connected (%)": g.total ? `${((g.conn / g.total) * 100).toFixed(1)}%` : "0.0%",
      "Avg Duration": tcHms(g.total ? g.dur / g.total : 0),
    }));
  }
  const ids = [...groups.keys()].filter((k) => k !== "unassigned");
  const names = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from("profiles").select("id, full_name").in("id", ids.slice(i, i + 200));
    (data || []).forEach((p: any) => names.set(p.id, p.full_name?.trim() || "Unnamed"));
  }
  return [...groups.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, g]) => ({
    "Employee Name": id === "unassigned" ? "Unassigned" : names.get(id) ?? "Unnamed",
    "Total Calls": g.total,
    "Connected Calls": g.conn,
    "Failed Calls": g.total - g.conn,
    "Total Duration": tcHms(g.dur),
    "Avg Talk Time": tcHms(g.conn ? g.dur / g.conn : 0),
  }));
}

/** Same campaign funnel as the Lead Generation report page, one row per platform + campaign. */
const lgLast10 = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);
const lgPlatform = (source?: string | null) => {
  const s = (source || "").toLowerCase();
  if (s.includes("meta") || s.includes("facebook") || s.includes("instagram")) return "Meta";
  if (s.includes("google") || s.includes("adwords")) return "Google";
  if (s.includes("camp") || s.includes("offline") || s.includes("seminar") || s.includes("walk")) return "Offline";
  if (s.includes("web") || s.includes("seo") || s.includes("site") || s.includes("form")) return "Web";
  return "Other";
};
async function lgAll(build: (f: number, t: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build(f, f + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function fetchLeadGeneration(from?: Date, to?: Date): Promise<Record<string, any>[]> {
  const fromISO = from?.toISOString(), toISO = to?.toISOString();
  const fromD = fromISO?.slice(0, 10), toD = toISO?.slice(0, 10);
  const sb = supabase as any;
  const [leads, appts, bills, patients, items, spend] = await Promise.all([
    lgAll((f, t) => {
      let q = sb.from("leads").select("id, phone, source, meta_form_name, created_at");
      if (fromISO) q = q.gte("created_at", fromISO);
      if (toISO) q = q.lte("created_at", toISO);
      return q.range(f, t);
    }),
    lgAll((f, t) => sb.from("appointments").select("patient_id, created_at, booked_by_name, created_from, checkin_time").range(f, t)),
    lgAll((f, t) => sb.from("billings").select("id, patient_id, amount_paid, created_at").range(f, t)),
    lgAll((f, t) => sb.from("patients").select("id, phone").range(f, t)),
    lgAll((f, t) => sb.from("billing_items").select("billing_id").range(f, t)),
    lgAll((f, t) => {
      let q = sb.from("marketing_ad_spend").select("platform, campaign_name, amount");
      if (fromD) q = q.gte("period_end", fromD);
      if (toD) q = q.lte("period_start", toD);
      return q.range(f, t);
    }),
  ]);
  const group = (arr: any[], k: string) => {
    const m = new Map<string, any[]>();
    arr.forEach((x) => { const v = x[k]; if (!v) return; (m.get(v) || m.set(v, []).get(v)!).push(x); });
    return m;
  };
  const byPhone = new Map<string, string[]>();
  patients.forEach((p) => { const k = lgLast10(p.phone); if (k) (byPhone.get(k) || byPhone.set(k, []).get(k)!).push(p.id); });
  const apptsBy = group(appts, "patient_id"), billsBy = group(bills, "patient_id");
  const billedIds = new Set(items.map((i) => i.billing_id));
  const spendBy = new Map<string, number>();
  spend.forEach((s) => {
    const k = `${s.platform}|${(s.campaign_name || "").trim().toLowerCase()}`;
    spendBy.set(k, (spendBy.get(k) || 0) + Number(s.amount || 0));
  });
  const rows = new Map<string, any>();
  leads.forEach((l) => {
    const platform = lgPlatform(l.source);
    const campaign = (platform === "Meta" && l.meta_form_name?.trim()) || l.source?.trim() || "Unknown source";
    const key = `${platform}|${campaign.toLowerCase()}`;
    const created = new Date(l.created_at).getTime() - 86400000;
    const la: any[] = [], lb: any[] = [];
    (byPhone.get(lgLast10(l.phone)) || []).forEach((pid) => {
      (apptsBy.get(pid) || []).forEach((a) => { if (new Date(a.created_at).getTime() >= created) la.push(a); });
      (billsBy.get(pid) || []).forEach((b) => { if (new Date(b.created_at).getTime() >= created) lb.push(b); });
    });
    let r = rows.get(key);
    if (!r) {
      r = { platform, campaign, spend: spendBy.get(key) || 0, leads: 0, appts: 0, visits: 0, treatments: 0, revenue: 0, bookedBy: new Set<string>() };
      rows.set(key, r);
    }
    r.leads += 1;
    if (la.length) r.appts += 1;
    if (la.some((a) => a.checkin_time)) r.visits += 1;
    if (lb.length && (lb.some((b) => billedIds.has(b.id)) || lb.length)) r.treatments += 1;
    r.revenue += lb.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
    la.forEach((a) => r.bookedBy.add((a.booked_by_name || "").trim() ||
      ((a.created_from || "").toLowerCase().includes("portal") ? "Online / Self-booked" : "Not recorded")));
  });
  return Array.from(rows.values()).sort((a, b) => b.leads - a.leads).map((r) => ({
    Platform: r.platform,
    Campaign: r.campaign,
    "Ad Spend": Math.round(r.spend),
    Leads: r.leads,
    CPL: r.leads && r.spend ? Math.round(r.spend / r.leads) : 0,
    Appointments: r.appts,
    "Booked By": Array.from(r.bookedBy).join(", "),
    Visits: r.visits,
    Treatments: r.treatments,
    Revenue: Math.round(r.revenue),
  }));
}

export default function SalesMarketingDownloadReports() {
  const { toast } = useToast();
  const dr = useDateRangeFilter("month");
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, any>[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [platform, setPlatform] = useState("all");
  const [stage, setStage] = useState("all");
  const [source, setSource] = useState("all");
  const [status, setStatus] = useState("all");
  const [campaign, setCampaign] = useState("");

  const activeFilters = useMemo(
    () => ({ platform, stage, source, status, campaign: campaign.trim() }),
    [platform, stage, source, status, campaign]
  );

  const dateLabel = () => {
    if (dr.preset === "all") return "All Time";
    if (dr.range.from && dr.range.to) return `${format(dr.range.from, "dd MMM yyyy")} – ${format(dr.range.to, "dd MMM yyyy")}`;
    return dr.preset;
  };

  const applySharedFilters = (def: SMReportDef, rows: any[]) => {
    if (!def.filters?.length) return rows;
    return rows.filter((r) => {
      for (const kind of def.filters!) {
        const field = def.filterFields?.[kind];
        if (kind === "campaign") {
          const needle = activeFilters.campaign.toLowerCase();
          if (!needle) continue;
          const hay = String(
            (field ? r[field] : undefined) ?? r.campaign?.name ?? r.campaign?.camp_code ?? ""
          ).toLowerCase();
          if (!hay.includes(needle)) return false;
          continue;
        }
        const selected = (activeFilters as any)[kind] as string;
        if (!selected || selected === "all" || !field) continue;
        if (String(r[field] ?? "").toLowerCase() !== selected.toLowerCase()) return false;
      }
      return true;
    });
  };

  /** Paged read so tables above the 1,000-row cap export fully. */
  const fetchData = async (def: SMReportDef) => {
    if (def.key === "lead_generation") return fetchLeadGeneration(dr.range.from, dr.range.to);
    if (def.key === "telecaller_periodic") return fetchTelecaller("periodic", dr.range.from, dr.range.to);
    if (def.key === "telecaller_employee") return fetchTelecaller("employee", dr.range.from, dr.range.to);
    const PAGE = 1000;
    const out: any[] = [];
    for (let page = 0; page < 30; page++) {
      let q: any = (supabase as any)
        .from(def.table)
        .select(def.select)
        .order(def.dateField, { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (dr.range.from) {
        const v = def.dateIsTimestamp ? dr.range.from.toISOString() : dr.range.from.toISOString().split("T")[0];
        q = q.gte(def.dateField, v);
      }
      if (dr.range.to) {
        const v = def.dateIsTimestamp ? dr.range.to.toISOString() : dr.range.to.toISOString().split("T")[0];
        q = q.lte(def.dateField, v);
      }
      const { data, error } = await q;
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  };

  const buildRows = (def: SMReportDef, data: any[]): Record<string, any>[] => {
    const rows = applySharedFilters(def, data);
    // Local SEO snapshots hold rankings as JSON — flatten to one row per keyword.
    if (def.key === "local_seo") {
      const flat: Record<string, any>[] = [];
      rows.forEach((snap: any) => {
        const rankings = Array.isArray(snap.rankings) ? snap.rankings : [];
        rankings.forEach((k: any) => {
          flat.push({
            "Snapshot End": fmt(snap.range_end),
            "Snapshot Start": fmt(snap.range_start),
            Site: snap.site_url ?? "",
            Query: k.query ?? k.keys?.[0] ?? "",
            Position: typeof k.position === "number" ? Number(k.position.toFixed(1)) : (k.position ?? ""),
            Clicks: k.clicks ?? 0,
            Impressions: k.impressions ?? 0,
            "CTR %": typeof k.ctr === "number" ? Number((k.ctr * 100).toFixed(2)) : (k.ctr ?? ""),
          });
        });
      });
      return flat;
    }
    if (def.mapRow) return rows.map(def.mapRow);
    return rows.map((r) => {
      const out: Record<string, any> = {};
      Object.entries(r).forEach(([k, v]) => {
        const key = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        if (v == null) out[key] = "";
        else if (Array.isArray(v)) out[key] = v.join(", ");
        else if (typeof v === "object") out[key] = JSON.stringify(v);
        else out[key] = v;
      });
      return out;
    });
  };

  const openPreview = async (def: SMReportDef) => {
    setPreviewKey(def.key);
    setPreviewLoading(true);
    setPreviewRows([]);
    try {
      setPreviewRows(buildRows(def, await fetchData(def)));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setPreviewKey(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const writeExcel = (label: string, rows: Record<string, any>[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, label.substring(0, 31));
    XLSX.writeFile(wb, `${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  const writePDF = async (label: string, rows: Record<string, any>[]) => {
    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = await addClinicPdfHeader(doc, branding);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`${label} Report`, 14, startY);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Period: ${dateLabel()}  |  Total: ${rows.length}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, 14, startY + 6);
    doc.setTextColor(0);
    const cols = Object.keys(rows[0]);
    autoTable(doc, {
      head: [cols],
      body: rows.map((r) => cols.map((c) => String(r[c] ?? ""))),
      startY: startY + 12,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 58, 95], fontSize: 8 },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });
    doc.save(`${label.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };

  const downloadExcel = async (def: SMReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_xlsx");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records in selected range.` }); return; }
      writeExcel(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadPDF = async (def: SMReportDef, presetRows?: Record<string, any>[]) => {
    setBusy(def.key + "_pdf");
    try {
      const rows = presetRows ?? buildRows(def, await fetchData(def));
      if (!rows.length) { toast({ title: "No data", description: `No ${def.label} records in selected range.` }); return; }
      await writePDF(def.label, rows);
      toast({ title: "Downloaded", description: `${def.label} (${rows.length} records)` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const downloadAllExcel = async () => {
    setBusy("all_xlsx");
    try {
      const wb = XLSX.utils.book_new();
      let totalRows = 0;
      const errors: string[] = [];
      for (const def of REPORTS) {
        if (def.linkTo) continue; // page-link cards export from their own page, not a table
        try {
          const rows = buildRows(def, await fetchData(def));
          totalRows += rows.length;
          const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: "No records in selected period" }]);
          XLSX.utils.book_append_sheet(wb, ws, def.label.substring(0, 31));
        } catch (e: any) {
          errors.push(`${def.label}: ${e.message}`);
        }
      }
      XLSX.writeFile(wb, `Sales_Marketing_All_Reports_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
      toast({
        title: "Downloaded",
        description: errors.length ? `${totalRows} records. Errors: ${errors.join("; ")}` : `All reports (${totalRows} total records)`,
        variant: errors.length ? "destructive" : "default",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const previewDef = REPORTS.find((r) => r.key === previewKey);

  const clearFilters = () => {
    setPlatform("all"); setStage("all"); setSource("all"); setStatus("all"); setCampaign("");
  };
  const filtersActive = platform !== "all" || stage !== "all" || source !== "all" || status !== "all" || !!campaign.trim();

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Download className="h-7 w-7 text-primary" /> Sales &amp; Marketing Download Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            Preview, then export every Sales &amp; Marketing menu as Excel or PDF for any date range. Live data, always accurate.
          </p>
        </div>
        <Button onClick={downloadAllExcel} disabled={!!busy}>
          {busy === "all_xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
          Download All (Excel)
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Date range applies to every report. The other filters apply only to reports that have that field.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter
              preset={dr.preset}
              onPresetChange={dr.setPreset}
              customFrom={dr.customFrom}
              customTo={dr.customTo}
              onCustomFromChange={dr.setCustomFrom}
              onCustomToChange={dr.setCustomTo}
              hideTomorrow
              showYesterday
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="google_business">Google Business</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="seo">SEO</SelectItem>
                <SelectItem value="meta">Meta Ads</SelectItem>
                <SelectItem value="google">Google Ads</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue placeholder="Lead Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                <SelectItem value="new_lead">New Lead</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="appointment_booked">Appointment Booked</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="meta_ads">Meta Ads</SelectItem>
                <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="walk_in">Walk-in</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="offline_camp">Offline Camp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Campaign name contains…"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Selected: <Badge variant="secondary">{dateLabel()}</Badge>
            {filtersActive && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((def) => {
          const Icon = def.icon;
          const xlsxBusy = busy === def.key + "_xlsx";
          const pdfBusy = busy === def.key + "_pdf";
          return (
            <Card key={def.key} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-5 w-5 text-primary" />
                  {def.label}
                </CardTitle>
                <CardDescription className="text-xs">{def.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2">
                <Button size="sm" variant="default" onClick={() => (def.linkTo ? navigate(def.linkTo) : openPreview(def))} disabled={!!busy}>
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <Button size="sm" variant="outline" onClick={() => (def.linkTo
                  ? toast({ title: def.label, description: `Exports live on the ${def.label} page — opening it via View.` })
                  : downloadExcel(def))} disabled={!!busy}>
                  {xlsxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => (def.linkTo
                  ? toast({ title: def.label, description: `Exports live on the ${def.label} page — opening it via View.` })
                  : downloadPDF(def))} disabled={!!busy}>
                  {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {previewDef && (
        <ReportPreviewDialog
          open={!!previewKey}
          onOpenChange={(o) => !o && setPreviewKey(null)}
          title={previewDef.label}
          periodLabel={dateLabel()}
          rows={previewRows}
          loading={previewLoading}
          busy={busy}
          busyKey={previewDef.key}
          onDownloadExcel={() => downloadExcel(previewDef, previewRows)}
          onDownloadPDF={() => downloadPDF(previewDef, previewRows)}
        />
      )}
    </div>
  );
}
