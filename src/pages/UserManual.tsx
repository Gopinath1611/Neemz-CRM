import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Search,
  Stethoscope,
  Megaphone,
  IndianRupee,
  UserCog,
  Workflow,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  Play,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  TYPES                                                                     */
/* -------------------------------------------------------------------------- */
type Step = { title: string; detail: string };
type ModuleGuide = {
  id: string;
  name: string;
  route?: string;
  summary: string;
  steps: Step[];
  workflow?: string[];
  tips?: string[];
  syncs?: string[];
  videoUrl?: string;
};
type Category = {
  id: "clinic" | "sales_marketing" | "finance" | "hr" | "settings";
  label: string;
  description: string;
  icon: any;
  modules: ModuleGuide[];
};

/* -------------------------------------------------------------------------- */
/*  CONTENT — easy to extend in the future                                    */
/* -------------------------------------------------------------------------- */
const CATEGORIES: Category[] = [
  {
    id: "clinic",
    label: "Clinic Modules",
    description: "Patient visit flow, treatment, lab, pharmacy, inventory, expenses, portal & more.",
    icon: Stethoscope,
    modules: [
      {
        id: "appointments",
        name: "Appointments",
        route: "/appointments",
        summary: "Book, reschedule and track all patient appointments — live sync across all staff.",
        steps: [
          { title: "New Appointment", detail: "Click 'New Appointment' (or Bulk for multiple slots)." },
          { title: "Pick patient & doctor", detail: "Patient list pulls live from Patient Database; doctor list from Master Data." },
          { title: "Date & time", detail: "12-hour AM/PM picker; auto 30-min end time." },
          { title: "Save", detail: "Appears instantly on every logged-in user's screen (telecaller, receptionist, doctor)." },
        ],
        syncs: ["Realtime: telecaller bookings appear instantly on receptionist & doctor screens.", "New patients added here flow into Patient Database."],
      },
      {
        id: "clinic-workflow",
        name: "Clinic Workflow",
        route: "/clinic-workflow",
        summary: "End-to-end patient visit: Check-in → Vitals → Treatment & Photos → Consult → Prescription → Lab → Billing → Payment → Checkout → Summary.",
        steps: [
          { title: "Open Clinic Workflow", detail: "Sidebar → Clinic → Clinic Workflow." },
          { title: "Search / add patient", detail: "Use the top search; if new, click 'New Patient'." },
          { title: "Check In", detail: "Click 'Check In Patient'. Same-day re-check-in is allowed after checkout." },
          { title: "Vitals", detail: "BP, Pulse, SpO2, Temperature — saved against today's visit." },
          { title: "Treatment & Photos", detail: "Add findings on the FDI dental chart (Q1-Q4 grid). Upload clinical photos (fullscreen lightbox + multi-select WA share)." },
          { title: "Consultation", detail: "Doctor records diagnosis & plan; choose next step (Prescription / Lab / Diagnostics / EMI / Billing)." },
          { title: "Diagnostics", detail: "Order X-Ray, Scan or Blood Test; share via WA/SMS/Print." },
          { title: "Prescription", detail: "Pick medicines from masters; dosage (0, ½, 1, 1½); quantity & price auto-calculated." },
          { title: "Lab Orders", detail: "Create Q1-Q4 lab orders directly from this step." },
          { title: "Billing & Payment", detail: "Pick treatments; split / partial / full payment. Each payment is logged on its own date (not back-dated)." },
          { title: "Checkout", detail: "Generates Treatment Summary + auto WA review request." },
        ],
        workflow: ["Check-in", "Vitals", "Treatment & Photos", "Consultation", "Treatment Done", "Prescription", "Lab Orders", "Diagnostics", "Billing", "Payment", "Checkout", "Summary", "History"],
        syncs: [
          "Prescription → Pharmacy (auto)",
          "Lab step → Lab Orders module",
          "Diagnostics → External Referrals",
          "Billing payments → Finance Revenue (by payment date)",
          "Checkout → Patient History + Recalls + Reviews",
        ],
        tips: [
          "Collapse the right panel for a full-width work area.",
          "FDI tooth: type 1-8, system auto-converts to 11-48.",
          "Partial payment history is preserved per date — never overwrites previous payments.",
        ],
      },
      {
        id: "pending-treatments",
        name: "Pending Treatments",
        route: "/pending-treatments",
        summary: "All planned but not-yet-done treatments across patients with 4-quadrant inputs & follow-up.",
        steps: [
          { title: "View list", detail: "Filter by patient, doctor, date." },
          { title: "Edit plan", detail: "Update tooth, treatment, expected date (auto 30-min end)." },
          { title: "Schedule", detail: "Convert to Appointment in one click." },
        ],
        syncs: ["Pulled from Consultation 'Upcoming Treatments' section.", "Schedule action → Appointments module."],
      },
      {
        id: "ortho-treatment",
        name: "Ortho Treatment",
        route: "/ortho-treatment",
        summary: "Full ortho lifecycle: diagnosis, records, treatment plan, visit log, wire sequence, installments, photos, retention & timeline.",
        steps: [
          { title: "Pick patient", detail: "From patient list or open from Clinic Workflow." },
          { title: "Diagnosis & records", detail: "Upload OPG, lateral ceph, intra-oral & extra-oral photos." },
          { title: "Treatment plan", detail: "Phases, appliances, estimated duration." },
          { title: "Visit log", detail: "Record each adjustment + wire sequence used." },
          { title: "Installments", detail: "Split case fee into EMIs; live paid-vs-pending." },
          { title: "Retention", detail: "Retainer issue & follow-up reminders." },
        ],
        syncs: ["Installment payments → Finance Revenue (per payment date)."],
      },
      {
        id: "emi-insurance",
        name: "EMI & Insurance",
        route: "/emi-insurance",
        summary: "KYC, EMI calculator and insurance claim tracking. Triggered from Consultation step.",
        steps: [
          { title: "Send from Consultation", detail: "Click 'Send to EMI & Insurance' on the consultation step." },
          { title: "KYC", detail: "Capture PAN, Aadhaar, income proof." },
          { title: "EMI calculator", detail: "Tenure, interest, monthly installment." },
          { title: "Insurance claim", detail: "Track claim status: submitted → approved → paid." },
        ],
      },
      {
        id: "ai-smile-design",
        name: "AI Smile Design",
        route: "/ai-smile-design",
        summary: "Upload photos → AI tooth detection → treatment plan → AI before/after simulation → WhatsApp share.",
        steps: [
          { title: "Upload photo", detail: "Front smile photo of the patient." },
          { title: "AI detection", detail: "Teeth detected automatically." },
          { title: "Plan + simulate", detail: "Pick treatment; AI renders before/after." },
          { title: "Share", detail: "Send to patient on WhatsApp." },
        ],
      },
      {
        id: "external-referrals",
        name: "External Referrals",
        route: "/external-referrals",
        summary: "Tracks every diagnostic / external lab order: status, cost, report upload.",
        steps: [
          { title: "Auto-created", detail: "Every Diagnostics step entry lands here." },
          { title: "Update status", detail: "Pending → In Progress → Report received." },
          { title: "Upload report", detail: "Attach PDF/image; auto-links to patient." },
        ],
      },
      {
        id: "patient-database",
        name: "Patient Database",
        route: "/patient-database",
        summary: "Single source of truth — source tags (Meta/Google/Walk-in/Camp), import/export, deep-link to check-in.",
        steps: [
          { title: "Search / filter", detail: "By name, mobile, source." },
          { title: "Add patient", detail: "Click 'Add Patient' → fill basics → save." },
          { title: "Deep link", detail: "Row click opens patient straight in Clinic Workflow." },
          { title: "Import / Export", detail: "Excel templates at top-right." },
        ],
      },
      {
        id: "lab-orders",
        name: "Lab Orders",
        route: "/lab-orders",
        summary: "Create, track & receive lab work tied to teeth (Q1-Q4). Realtime updates.",
        steps: [
          { title: "Auto-created from workflow", detail: "Lab step in Clinic Workflow." },
          { title: "Track", detail: "Pending → In Progress → Received." },
          { title: "Deep links", detail: "Click patient ID/name → opens patient." },
        ],
      },
      {
        id: "pharmacy",
        name: "Pharmacy",
        route: "/pharmacy",
        summary: "Auto-fed from every prescription. Date filters + deep links.",
        steps: [
          { title: "Auto entries", detail: "Each prescription auto-creates a pharmacy row." },
          { title: "Date filter", detail: "Today / week / month." },
          { title: "Mark dispensed", detail: "Updates Inventory stock." },
        ],
        syncs: ["Prescription → Pharmacy → Inventory stock movement."],
      },
      {
        id: "patient-education",
        name: "Patient Education",
        route: "/patient-education",
        summary: "Standalone AI + YouTube education library to share with patients.",
        steps: [
          { title: "Browse library", detail: "Filter by topic / treatment." },
          { title: "Share", detail: "WhatsApp link to patient with one click." },
        ],
      },
      {
        id: "sterilization",
        name: "Sterilization Log",
        route: "/sterilization",
        summary: "Daily sterilization cycles — autoclave, performed-by (assistant masters).",
        steps: [
          { title: "Log cycle", detail: "Date, autoclave, cycle no, performed-by." },
          { title: "Edit / delete", detail: "Full CRUD with audit trail." },
        ],
      },
      {
        id: "waste-management",
        name: "Waste Management",
        route: "/waste-management",
        summary: "Bio-medical waste manifests (auto-numbered WM-YYYYMMDD), collected-by person.",
        steps: [
          { title: "New manifest", detail: "Auto-number; pick collector & category." },
          { title: "Print / share", detail: "PDF for compliance records." },
        ],
      },
      {
        id: "inventory",
        name: "Inventory",
        route: "/inventory",
        summary: "Stock management with auto SKU (INV-0001), low-stock alerts, bulk purchase flow.",
        steps: [
          { title: "Add item", detail: "Name, category, supplier, min stock — SKU auto-generated." },
          { title: "Low stock alerts", detail: "Items below min appear on Dashboard widget." },
          { title: "Bulk → Purchase", detail: "Select low-stock items → 'Proceed to Purchase' creates a draft PO." },
        ],
        syncs: ["Pharmacy dispense → stock down.", "Purchase receive → stock up."],
      },
      {
        id: "purchases",
        name: "Purchases",
        route: "/purchases",
        summary: "Purchase orders, auto-drafted from low-stock inventory.",
        steps: [
          { title: "Create PO", detail: "Pick supplier + items (or via Inventory)." },
          { title: "Receive goods", detail: "Updates stock & posts to Expenses." },
        ],
      },
      {
        id: "expenses",
        name: "Expenses",
        route: "/expenses",
        summary: "Record clinic expenses with inline category & supplier; approval flow.",
        steps: [
          { title: "Add expense", detail: "Amount, category, supplier, date, attachment." },
          { title: "Approve", detail: "Pending → Approved → posts to Finance." },
        ],
      },
      {
        id: "patient-portal",
        name: "Patient Portal",
        route: "/patient-portal",
        summary: "Patient-facing portal: appointments, treatment summary, prescriptions, payments.",
        steps: [
          { title: "Share link", detail: "Auto WA link to portal after checkout." },
          { title: "Patient views", detail: "Past visits, prescriptions, pending dues." },
        ],
      },
      {
        id: "download-reports",
        name: "Download Reports",
        route: "/download-reports",
        summary: "Found under Reports → Clinical Reports. PDF/Excel exports for any clinic module with date filters.",
        steps: [
          { title: "Pick module", detail: "Patients, Appointments, Treatments, Billing, etc." },
          { title: "Date range", detail: "Smart filter." },
          { title: "Export", detail: "PDF or Excel." },
        ],
      },
      {
        id: "productivity-report",
        name: "Productivity Report",
        route: "/productivity-report",
        summary: "Found under Reports → Clinical Reports. Per-staff/per-doctor productivity & utilization.",
        steps: [
          { title: "Filter staff/date", detail: "Pick role + range." },
          { title: "View metrics", detail: "Patients seen, revenue generated, chair hours." },
        ],
      },
    ],
  },
  {
    id: "sales_marketing",
    label: "Sales & Marketing",
    description: "Reviews, WhatsApp, recalls, campaigns, lead awareness, lead management & automation.",
    icon: Megaphone,
    modules: [
      {
        id: "reviews",
        name: "Reviews",
        route: "/reviews",
        summary: "Auto-request Google reviews after checkout; list ratings & replies.",
        steps: [
          { title: "Checkout step", detail: "Auto WhatsApp review-request link is sent." },
          { title: "Track responses", detail: "View rating + comment + reply inline." },
        ],
      },
      {
        id: "referrals",
        name: "Referrals",
        route: "/referrals",
        summary: "Patient referral engine — referrer tracking + reward management.",
        steps: [
          { title: "Add referral", detail: "Tag referring patient on new patient entry." },
          { title: "Track rewards", detail: "Auto cashback / discount when converted." },
        ],
      },
      {
        id: "whatsapp",
        name: "WhatsApp",
        route: "/whatsapp",
        summary: "Bulk WhatsApp campaigns via Meta Cloud API + bot replies + approved templates.",
        steps: [
          { title: "Pick template", detail: "Meta-approved templates auto-listed." },
          { title: "Audience", detail: "Filter from Patient DB / Leads / Recalls." },
          { title: "Send / schedule", detail: "Live status: sent / delivered / read." },
        ],
      },
      {
        id: "recalls",
        name: "Patient Recalls",
        route: "/recalls",
        summary: "Post-treatment WhatsApp reminders (6-month checkup, scaling, etc.).",
        steps: [
          { title: "Auto-generated", detail: "From Checkout based on treatment type." },
          { title: "Send reminder", detail: "Bulk WA send on due date." },
        ],
      },

      // ---------- Offline Campaigns submodules ----------
      {
        id: "offline-ceo",
        name: "Offline Campaigns — CEO Dashboard",
        route: "/offline-campaigns",
        summary: "Birds-eye view of every offline campaign: spend, leads, conversions, ROI.",
        steps: [
          { title: "Open dashboard", detail: "Sidebar → Sales & Marketing → Offline Campaigns → CEO Dashboard." },
          { title: "Filter date / institution", detail: "Smart filter at top." },
        ],
      },
      {
        id: "offline-institutions",
        name: "Offline — Institutions",
        route: "/offline-campaigns#institutions",
        summary: "Schools, colleges, corporates, RWAs — master list of camp venues.",
        steps: [
          { title: "Add institution", detail: "Name, type, contact, address." },
          { title: "Link campaigns", detail: "Every camp ties to an institution." },
        ],
      },
      {
        id: "offline-campaigns-list",
        name: "Offline — Campaigns",
        route: "/offline-campaigns#campaigns",
        summary: "Create campaigns: date, budget, team, expected leads.",
        steps: [
          { title: "New campaign", detail: "Pick institution + date + budget." },
          { title: "Assign team", detail: "Doctors, assistants, telecallers." },
          { title: "Generate QR", detail: "Auto QR for self-registration." },
        ],
      },
      {
        id: "offline-leads",
        name: "Offline — Screening Leads",
        route: "/offline-campaigns#leads",
        summary: "Walk-in screening leads captured at the camp.",
        steps: [
          { title: "Register lead", detail: "Via QR scan or manual entry." },
          { title: "Tag screening", detail: "Treatment recommended → push to Leads pipeline." },
        ],
      },
      {
        id: "offline-coupons",
        name: "Offline — Coupons & Offers",
        route: "/offline-campaigns#coupons",
        summary: "Discount codes / offers attached to each campaign.",
        steps: [
          { title: "Create coupon", detail: "Code, value, validity, max uses." },
          { title: "Redeem at billing", detail: "Auto-applied at Payment step." },
        ],
      },
      {
        id: "offline-followups",
        name: "Offline — Follow-ups",
        route: "/offline-campaigns#followups",
        summary: "Telecaller follow-ups on screening leads.",
        steps: [
          { title: "Assign telecaller", detail: "Bulk or individual." },
          { title: "Log call", detail: "Outcome + next action + reminder." },
        ],
      },
      {
        id: "offline-partners",
        name: "Offline — Corporate Partners",
        route: "/offline-campaigns#partnerships",
        summary: "Long-term corporate tie-ups (insurance panels, OPD partners).",
        steps: [
          { title: "Add partner", detail: "Company, contract terms, billing rate." },
        ],
      },
      {
        id: "offline-roi",
        name: "Offline — ROI Calculator",
        route: "/offline-campaigns#roi",
        summary: "Cost vs. leads vs. converted patients vs. revenue per campaign.",
        steps: [
          { title: "Pick campaign", detail: "ROI auto-computed from billing data." },
        ],
      },

      // ---------- Lead Awareness submodules ----------
      {
        id: "connected-platforms",
        name: "Lead Awareness — Connected Platforms",
        route: "/connected-platforms",
        summary: "OAuth connect Google, Meta, WhatsApp, IVR, websites.",
        steps: [
          { title: "Pick platform", detail: "Click Connect → OAuth flow." },
          { title: "Verify", detail: "Green tick = healthy." },
        ],
        syncs: ["Connected sources auto-push leads into Lead Management → Pipeline."],
      },
      {
        id: "social-media",
        name: "Lead Awareness — Social Media Hub",
        route: "/social-media",
        summary: "Multi-platform posting, AI captions, content calendar, unified inbox.",
        steps: [
          { title: "Create post", detail: "AI suggests caption + hashtags." },
          { title: "Schedule", detail: "Pick channels + time." },
          { title: "Inbox", detail: "All DMs / comments in one view." },
        ],
      },
      {
        id: "local-seo",
        name: "Lead Awareness — Local SEO",
        route: "/local-seo",
        summary: "Google Business Profile management — posts, photos, Q&A.",
        steps: [
          { title: "Connect GBP", detail: "OAuth via Connected Platforms." },
          { title: "Post update", detail: "Schedule posts directly to GBP." },
        ],
      },

      // ---------- Lead Management submodules ----------
      {
        id: "pipeline",
        name: "Lead Management — Pipeline",
        route: "/pipeline",
        summary: "Drag-drop pipeline with AI priority score, inline edits & notification badges.",
        steps: [
          { title: "View stages", detail: "New → Contacted → Qualified → Appointment → Converted." },
          { title: "Inline edit", detail: "Auto-saves; live notifications." },
          { title: "Convert", detail: "One click → Appointment form pre-filled." },
        ],
      },
      {
        id: "followups",
        name: "Lead Management — Follow-ups",
        route: "/followups",
        summary: "All scheduled follow-ups across leads.",
        steps: [
          { title: "Today's list", detail: "Sorted by priority." },
          { title: "Log outcome", detail: "Auto next-action suggestion." },
        ],
      },
      {
        id: "lm-appointments",
        name: "Lead Management — Appointments",
        route: "/appointments",
        summary: "Appointments created from lead conversions.",
        steps: [
          { title: "From pipeline", detail: "Convert → Appointment." },
        ],
      },
      {
        id: "call-logs",
        name: "Lead Management — Call Logs",
        route: "/call-logs",
        summary: "IVR + manual call logs with recording playback.",
        steps: [
          { title: "Auto-logged", detail: "IVR calls land here automatically." },
          { title: "Tag outcome", detail: "Connect to lead/patient." },
        ],
      },
      {
        id: "contacts",
        name: "Lead Management — Contacts",
        route: "/contacts",
        summary: "All contacts (leads + patients + partners) in one searchable list.",
        steps: [
          { title: "Search", detail: "Name, phone, email." },
          { title: "Merge duplicates", detail: "One-click merge." },
        ],
      },
      {
        id: "messages",
        name: "Lead Management — Messages",
        route: "/messages",
        summary: "Unified inbox: WA, SMS, Email, Social.",
        steps: [
          { title: "Reply", detail: "From a single thread view." },
        ],
      },

      // ---------- Lead Automation submodules ----------
      {
        id: "automation-hub",
        name: "Lead Automation — Automation Hub",
        route: "/lead-automation",
        summary: "Workflow builder: Triggers → Conditions → Actions. IVR logs tied in.",
        steps: [
          { title: "Build workflow", detail: "Drag trigger (new lead, no reply 24h, etc.) → action (WA / SMS / assign)." },
          { title: "Activate", detail: "Toggle on; runs in background." },
        ],
      },
      {
        id: "automation-email",
        name: "Lead Automation — Email",
        route: "/automation-email",
        summary: "Email automation: drip campaigns, templates, opens/clicks.",
        steps: [
          { title: "Pick template", detail: "Or AI-generate." },
          { title: "Schedule sequence", detail: "Day 0 / Day 3 / Day 7." },
        ],
      },
      {
        id: "automation-whatsapp",
        name: "Lead Automation — WhatsApp API",
        route: "/automation-whatsapp",
        summary: "Programmatic WA via Meta Cloud API for automations.",
        steps: [
          { title: "Bind template", detail: "Pick Meta-approved template." },
          { title: "Trigger", detail: "From any workflow action." },
        ],
      },
      {
        id: "automation-workflow",
        name: "Lead Automation — Workflow",
        route: "/automation-workflow",
        summary: "Visual workflow canvas for cross-channel sequences.",
        steps: [
          { title: "Drag nodes", detail: "Connect Trigger → Condition → Action." },
        ],
      },
      {
        id: "automation-sms",
        name: "Lead Automation — SMS",
        route: "/automation-sms",
        summary: "Transactional & promotional SMS via gateway.",
        steps: [
          { title: "Sender ID", detail: "Configure DLT-approved sender." },
          { title: "Send / schedule", detail: "Bulk + scheduled SMS." },
        ],
      },
      {
        id: "automation-ivr",
        name: "Lead Automation — IVR",
        route: "/automation-ivr",
        summary: "Inbound/outbound IVR flows; call routing & recording.",
        steps: [
          { title: "Configure flow", detail: "Menu, routing, voicemail." },
          { title: "View logs", detail: "All calls in Call Logs." },
        ],
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    description: "Revenue, billing, payments, receivables, expenses, P&L, vendor payments, purchases, FY projection.",
    icon: IndianRupee,
    modules: [
      {
        id: "finance-dashboard",
        name: "Finance Dashboard",
        route: "/finance",
        summary: "All-in-one finance view with date range filter and inline category management.",
        steps: [
          { title: "Pick date range", detail: "Smart filter (today, week, month, FY)." },
          { title: "Switch sections", detail: "Revenue / Billing / Payments / Receivables / Expenses / P&L / Vendor." },
        ],
      },
      {
        id: "finance-revenue",
        name: "Revenue",
        route: "/finance#revenue",
        summary: "Total collected revenue — by treatment, doctor, source. Booked on payment date, not bill date.",
        steps: [
          { title: "Filter", detail: "Date range + treatment / doctor." },
          { title: "Drill-down", detail: "Click bar → patient-level rows." },
        ],
        syncs: ["Every Payment step entry posts here on its actual payment date.", "Partial payments split correctly across dates."],
      },
      {
        id: "finance-billing",
        name: "Billing & Invoicing",
        route: "/finance#billing",
        summary: "All invoices (paid / unpaid / partial). Inline edit + draft.",
        steps: [
          { title: "Search", detail: "By patient, invoice no, date." },
          { title: "Edit / reprint", detail: "Open in BillingDetailDialog." },
        ],
      },
      {
        id: "finance-payments",
        name: "Payments",
        route: "/finance#payments",
        summary: "Every payment row (cash / card / UPI / EMI) with date and mode.",
        steps: [
          { title: "Filter by mode", detail: "See cash vs digital split." },
          { title: "Reconcile", detail: "Match against bank statement." },
        ],
      },
      {
        id: "finance-receivables",
        name: "Receivables",
        route: "/finance#receivables",
        summary: "Outstanding patient balances — agewise & WA-remind in bulk.",
        steps: [
          { title: "Ageing buckets", detail: "0-30 / 31-60 / 61-90 / 90+." },
          { title: "Remind", detail: "Bulk WA reminder with payment link." },
        ],
      },
      {
        id: "finance-expenses",
        name: "Expenses (Finance view)",
        route: "/finance#expenses",
        summary: "All approved expenses rolled up for P&L.",
        steps: [
          { title: "Filter", detail: "Category / supplier / date." },
        ],
      },
      {
        id: "finance-pnl",
        name: "Profit & Loss",
        route: "/finance#pnl",
        summary: "Revenue − Expenses − COGS by period.",
        steps: [
          { title: "Pick period", detail: "Month, quarter, FY." },
          { title: "Export", detail: "PDF / Excel." },
        ],
      },
      {
        id: "finance-vendor",
        name: "Vendor Payments",
        route: "/finance#vendor",
        summary: "Supplier payable management, due dates, partial payments.",
        steps: [
          { title: "View dues", detail: "Per supplier ageing." },
          { title: "Record payment", detail: "Auto reduces payable." },
        ],
      },
      {
        id: "finance-download",
        name: "Finance Download Reports",
        route: "/finance/download-reports",
        summary: "Dedicated finance exports — GST, P&L, ledger.",
        steps: [
          { title: "Pick report", detail: "GST, ledger, P&L, expense register." },
          { title: "Export", detail: "PDF / Excel." },
        ],
      },
      {
        id: "fy-overview",
        name: "FY Projection — Overview",
        route: "/fy-projection/overview",
        summary: "Full-year plan vs. actuals across clinic, marketing, sales, recruitment, finance.",
        steps: [
          { title: "Set FY", detail: "Choose financial year." },
          { title: "Review variance", detail: "Plan vs actual per month." },
        ],
      },
      {
        id: "fy-clinic",
        name: "FY Projection — Clinic Module",
        route: "/fy-projection/clinic/patient",
        summary: "Patient, Treatment, Chair, Doctor targets.",
        steps: [
          { title: "Patient target", detail: "Monthly new patient count." },
          { title: "Treatment target", detail: "By treatment category." },
          { title: "Chair utilization", detail: "Hours used vs available." },
          { title: "Doctor target", detail: "Per doctor revenue plan." },
        ],
      },
      {
        id: "fy-marketing",
        name: "FY Projection — Marketing Module",
        route: "/fy-projection/marketing/ads",
        summary: "Ads, social, offline camp targets.",
        steps: [
          { title: "Ad target", detail: "Spend & expected leads." },
          { title: "Social target", detail: "Followers, reach, engagement." },
          { title: "Camp target", detail: "Camps planned & leads expected." },
        ],
      },
      {
        id: "fy-sales",
        name: "FY Projection — Sales Module",
        route: "/fy-projection/sales/target",
        summary: "Sales, PRE (pre-treatment), treatment-wise targets.",
        steps: [
          { title: "Sales target", detail: "Monthly sales value." },
          { title: "PRE target", detail: "Pre-treatment conversion %." },
          { title: "Treatment-wise", detail: "Target per treatment line." },
        ],
      },
      {
        id: "fy-recruitment",
        name: "FY Projection — Recruitment",
        route: "/fy-projection/recruitment/plan",
        summary: "Hiring plan against FY targets.",
        steps: [
          { title: "Plan roles", detail: "Role, count, joining month." },
        ],
      },
      {
        id: "fy-finance",
        name: "FY Projection — Finance Module",
        route: "/fy-projection/finance/topline",
        summary: "Topline, treatment revenue, digital ROI, offline camp ROI.",
        steps: [
          { title: "Topline plan", detail: "Monthly revenue target." },
          { title: "Treatment revenue", detail: "Revenue per treatment." },
          { title: "Digital ROI", detail: "Ad-spend vs revenue." },
          { title: "Offline ROI", detail: "Camp-spend vs revenue." },
        ],
      },
      {
        id: "fy-plans",
        name: "FY Projection — Plans & Reports",
        route: "/fy-projection/monthly",
        summary: "Monthly plan, profit forecast, variance reports.",
        steps: [
          { title: "Monthly plan", detail: "Break annual into months." },
          { title: "Profit forecast", detail: "Projected P&L." },
          { title: "Variance", detail: "Plan − actual." },
        ],
      },
    ],
  },
  {
    id: "hr",
    label: "Operations & HRMS",
    description: "Operations dashboards, KPIs, targets, meetings, employees, attendance, leave, payroll, recruitment, quality.",
    icon: UserCog,
    modules: [
      {
        id: "ops-dashboard",
        name: "Operations Dashboard",
        route: "/operations",
        summary: "KPIs, daily/weekly targets, incentives, to-do checklists.",
        steps: [
          { title: "Pick dashboard", detail: "Clinic / Sales & Marketing / Finance / HR & Admin." },
          { title: "Drill into role", detail: "Per-role KPIs auto-injected from department roles." },
        ],
      },
      {
        id: "ops-clinic",
        name: "Operations — Clinic Dashboard",
        route: "/operations#clinic",
        summary: "Clinic staff KPIs: doctors, assistants, receptionists, housekeeping.",
        steps: [
          { title: "Per-role view", detail: "Targets vs actuals." },
        ],
      },
      {
        id: "ops-sales",
        name: "Operations — Sales & Marketing Dashboard",
        route: "/operations#sales-marketing",
        summary: "Telecaller, marketing manager, executive KPIs.",
        steps: [
          { title: "Calls / leads / conversions", detail: "Per-day & per-week." },
        ],
      },
      {
        id: "ops-finance",
        name: "Operations — Finance Dashboard",
        route: "/operations#finance",
        summary: "Accountant + account manager KPIs.",
        steps: [
          { title: "Collections / receivables", detail: "Per-staff." },
        ],
      },
      {
        id: "ops-hr",
        name: "Operations — HR & Admin Dashboard",
        route: "/operations#hr-admin",
        summary: "HR manager + executive KPIs.",
        steps: [
          { title: "Recruitment / attendance compliance", detail: "Live counts." },
        ],
      },
      {
        id: "meetings",
        name: "Meetings",
        route: "/meetings",
        summary: "Schedule and minutes for staff meetings.",
        steps: [
          { title: "New meeting", detail: "Date, attendees, agenda." },
          { title: "Log minutes", detail: "Action items + owner + deadline." },
        ],
      },
      {
        id: "qc-dashboard",
        name: "Quality Control — Dashboard",
        route: "/quality-control",
        summary: "Doctor / Lab / Pharma quality scores.",
        steps: [
          { title: "Pick section", detail: "Doctor / Lab / Pharma." },
        ],
      },
      {
        id: "qc-doctor",
        name: "QC — Doctor Quality",
        route: "/quality-control#doctor",
        summary: "Doctor work quality tracking.",
        steps: [{ title: "Score visits", detail: "Per-treatment outcome scoring." }],
      },
      {
        id: "qc-lab",
        name: "QC — Lab Quality",
        route: "/quality-control#lab",
        summary: "External lab work quality.",
        steps: [{ title: "Score lab orders", detail: "Fit, finish, turnaround time." }],
      },
      {
        id: "qc-pharma",
        name: "QC — Pharma Quality",
        route: "/quality-control#pharma",
        summary: "Pharma stock & dispense quality.",
        steps: [{ title: "Audit stock", detail: "Expiry, batch, dispensing accuracy." }],
      },
      {
        id: "hrms-home",
        name: "HRMS Home",
        route: "/hrms/home",
        summary: "HRMS landing page — quick access tiles.",
        steps: [{ title: "Navigate", detail: "Click any tile to jump to that HRMS module." }],
      },
      {
        id: "employees",
        name: "Employees",
        route: "/employees",
        summary: "Master employee directory with deep tabs: primary, work, education, emergency, documents, compensation, statutory, loans, expenses, income tax, salary, exit.",
        steps: [
          { title: "Add employee", detail: "Personal + role + branch + documents." },
          { title: "Profile tabs", detail: "Switch between Primary / Work / Education / Documents / Compensation / Statutory / Loans / Expenses / Income Tax / Salary Template / Exit." },
        ],
      },
      {
        id: "recruitment",
        name: "Recruitment",
        route: "/recruitment",
        summary: "Open roles, candidates, interviews, offers.",
        steps: [
          { title: "Open role", detail: "Title, department, count." },
          { title: "Track pipeline", detail: "Applied → Interviewed → Offered → Joined." },
        ],
      },
      {
        id: "licenses",
        name: "License & Renewals",
        route: "/licenses",
        summary: "Track every license (clinic, doctor, biomedical waste) & renewal alerts.",
        steps: [{ title: "Add license", detail: "Type, number, expiry → auto reminders." }],
      },
      {
        id: "job-descriptions",
        name: "Job Descriptions",
        route: "/job-descriptions",
        summary: "Master JDs per role; attach to recruitment.",
        steps: [{ title: "Add JD", detail: "Role, responsibilities, KPIs." }],
      },
      {
        id: "training",
        name: "Training",
        route: "/training",
        summary: "Training programs, attendees, completion tracking.",
        steps: [{ title: "Create program", detail: "Topic, trainer, attendees." }],
      },
      {
        id: "document-management",
        name: "Document Management",
        route: "/document-management",
        summary: "Central document repository with version control.",
        steps: [{ title: "Upload doc", detail: "Tag category + visibility." }],
      },
      {
        id: "attendance-my",
        name: "Attendance — My Attendance",
        route: "/attendance/my",
        summary: "Geo-fenced check-in/out for self.",
        steps: [
          { title: "Punch in", detail: "Within geo-fence radius." },
          { title: "Punch out", detail: "End of shift." },
        ],
      },
      {
        id: "attendance-team",
        name: "Attendance — My Team",
        route: "/attendance/team",
        summary: "Manager view of team attendance.",
        steps: [{ title: "Approve / regularize", detail: "Edit punches with reason." }],
      },
      {
        id: "shift-my",
        name: "Attendance — My Shift",
        route: "/attendance/my-shift",
        summary: "Personal shift schedule.",
        steps: [{ title: "View week / month", detail: "Color-coded shifts." }],
      },
      {
        id: "shift-team",
        name: "Attendance — My Team Shift",
        route: "/attendance/team-shift",
        summary: "Plan team shifts.",
        steps: [{ title: "Drag-drop staff", detail: "Onto shift slots." }],
      },
      {
        id: "geo-fencing",
        name: "Attendance — Geo Fencing",
        route: "/attendance/geo-fencing",
        summary: "Define branch geo-fence radius for attendance.",
        steps: [{ title: "Set fence", detail: "Lat/long + radius per branch." }],
      },
      {
        id: "leave-my",
        name: "Leave — My Leaves",
        route: "/leave/my",
        summary: "Apply leave; view balance & history.",
        steps: [{ title: "Apply", detail: "Type, dates, reason." }],
      },
      {
        id: "leave-team",
        name: "Leave — My Team Leaves",
        route: "/leave/team",
        summary: "Manager approval queue.",
        steps: [{ title: "Approve / reject", detail: "With comment." }],
      },
      {
        id: "leave-holidays",
        name: "Leave — Holidays",
        route: "/leave/holidays",
        summary: "Annual holiday calendar per branch.",
        steps: [{ title: "Add holiday", detail: "Date, name, applies-to." }],
      },
      {
        id: "leave-rollover",
        name: "Leave — Roll Over",
        route: "/leave/rollover",
        summary: "Year-end leave roll-over rules.",
        steps: [{ title: "Configure", detail: "Max carry-forward per leave type." }],
      },
      {
        id: "leave-compoff",
        name: "Leave — Comp-Off Request",
        route: "/leave/comp-off",
        summary: "Request comp-off for worked holidays.",
        steps: [{ title: "Submit", detail: "Worked date + comp-off date." }],
      },
      {
        id: "leave-customization",
        name: "Leave — Customization Balance",
        route: "/leave/customization",
        summary: "Adjust individual leave balances.",
        steps: [{ title: "Edit balance", detail: "Add/remove with audit reason." }],
      },
      {
        id: "payroll-dashboard",
        name: "Payroll — Dashboard",
        route: "/payroll",
        summary: "Payroll overview: cost, headcount, pending payruns.",
        steps: [{ title: "Open dashboard", detail: "All KPIs in one view." }],
      },
      {
        id: "payroll-payruns",
        name: "Payroll — Payruns",
        route: "/payroll/payruns",
        summary: "Monthly payrun: auto-pulls attendance + leaves.",
        steps: [
          { title: "Create payrun", detail: "Pick month." },
          { title: "Review & approve", detail: "Generate payslips + bank file." },
        ],
      },
      {
        id: "payroll-form16",
        name: "Payroll — Form 16",
        route: "/payroll/form-16",
        summary: "Generate annual Form 16 per employee.",
        steps: [{ title: "Pick FY", detail: "Bulk generate." }],
      },
      {
        id: "payroll-payslips",
        name: "Payroll — Payslips",
        route: "/payroll/payslips",
        summary: "Per-employee payslip download & email.",
        steps: [{ title: "Filter staff/month", detail: "Download or email." }],
      },
      {
        id: "payroll-banks",
        name: "Payroll — Bank Accounts",
        route: "/payroll/banks",
        summary: "Bank account masters for salary disbursement.",
        steps: [{ title: "Add bank", detail: "Name, IFSC, branch." }],
      },
      {
        id: "hrms-reports",
        name: "HRMS Reports",
        route: "/hrms/reports?tab=organization",
        summary: "Organization, Attendance, Leave, Payroll, Statutory reports.",
        steps: [
          { title: "Pick tab", detail: "Organization / Attendance / Leave / Payroll / Statutory." },
          { title: "Export", detail: "PDF / Excel." },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings & Admin",
    description: "Master data, staff & roles, branches, integrations, branding, dashboard & analytics.",
    icon: Workflow,
    modules: [
      {
        id: "dashboard",
        name: "Dashboard",
        route: "/",
        summary: "Home dashboard: revenue, leads, low stock, HR/license alerts in real-time.",
        steps: [
          { title: "Realtime tiles", detail: "Revenue, leads, appointments, low-stock, license expiry." },
          { title: "Drill-down", detail: "Click any tile → opens source module." },
        ],
      },
      {
        id: "analytics",
        name: "AI Analytics",
        route: "/analytics",
        summary: "8-section AI analytics: Sales, Marketing, Finance, Growth, Clinic Ops, Employee KPI, AI Predictive, Super Dashboard.",
        steps: [
          { title: "Pick section", detail: "Tabs across the top." },
          { title: "Date filter", detail: "Smart filter per section." },
          { title: "Export", detail: "PDF / Excel." },
        ],
      },
      {
        id: "settings-masters",
        name: "Settings — Master Data",
        route: "/settings",
        summary: "Doctor / Treatment / Medicine / Lab / Suppliers — single source for every dropdown.",
        steps: [
          { title: "Open Settings", detail: "Sidebar → Settings." },
          { title: "Pick category", detail: "Edit / add masters." },
          { title: "Live sync", detail: "Changes reflect everywhere instantly via useClinicMasters." },
        ],
      },
      {
        id: "settings-staff",
        name: "Settings — Add & Manage Staff",
        route: "/settings",
        summary: "Add users, assign roles, configure granular permissions (Settings & Patient DB), live RBAC refresh.",
        steps: [
          { title: "Add staff", detail: "Email + role(s) + branch." },
          { title: "Custom roles", detail: "Define role with route-level permissions." },
          { title: "Permissions", detail: "Granular toggles." },
        ],
        syncs: ["Live RBAC: changes propagate within 5 seconds or on tab focus."],
      },
      {
        id: "settings-branches",
        name: "Settings — Branches",
        route: "/settings",
        summary: "Multi-branch setup; live branch switcher in header filters all data.",
        steps: [
          { title: "Add branch", detail: "Name, address, GST, branding." },
          { title: "Switch", detail: "Top-bar switcher → all data filters." },
        ],
      },
      {
        id: "settings-integrations",
        name: "Settings — App Store Integrations",
        route: "/connected-platforms",
        summary: "WhatsApp, IVR, Google, Meta — OAuth connectors.",
        steps: [
          { title: "Connect", detail: "OAuth flow." },
          { title: "Verify", detail: "Health-check green." },
        ],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/*  COMPONENT                                                                 */
/* -------------------------------------------------------------------------- */
export default function UserManual() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Category["id"]>("clinic");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      modules: cat.modules.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.summary.toLowerCase().includes(q) ||
          m.steps.some((s) => s.title.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q)),
      ),
    })).filter((c) => c.modules.length > 0);
  }, [query]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-3 text-primary">
            <BookOpen className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">User Manual</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              Step-by-step guide for every module. Search, browse by category, or open a module to see the workflow, syncs and tips.
            </p>
          </div>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules, steps…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CATEGORIES.map((c) => (
          <Card
            key={c.id}
            className="cursor-pointer hover:shadow-md transition"
            onClick={() => {
              setQuery("");
              setActiveTab(c.id);
            }}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <c.icon className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold text-sm">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.modules.length} modules</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      {query ? (
        <div className="space-y-6">
          {filtered.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No modules match "{query}".
              </CardContent>
            </Card>
          )}
          {filtered.map((cat) => (
            <CategorySection key={cat.id} category={cat} />
          ))}
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Category["id"])}>
          <TabsList className="flex flex-wrap h-auto">
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="gap-2">
                <c.icon className="h-4 w-4" />
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {CATEGORIES.map((cat) => (
            <TabsContent key={cat.id} value={cat.id} className="mt-6">
              <CategorySection category={cat} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SUB-COMPONENTS                                                            */
/* -------------------------------------------------------------------------- */
function CategorySection({ category }: { category: Category }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <category.icon className="h-6 w-6 text-primary mt-1" />
        <div>
          <h2 className="text-xl font-bold">{category.label}</h2>
          <p className="text-sm text-muted-foreground">{category.description}</p>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        {category.modules.map((m) => (
          <AccordionItem
            key={m.id}
            value={m.id}
            className="border rounded-lg px-4 bg-card"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-start gap-3 text-left">
                <div className="rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-semibold">
                  {category.modules.indexOf(m) + 1}
                </div>
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-muted-foreground font-normal">{m.summary}</div>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent className="space-y-5 pt-2">
              {m.route && (
                <a
                  href={m.route}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Open module <ArrowRight className="h-3 w-3" />
                </a>
              )}

              {/* Step-by-step */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" /> Step-by-step
                </h4>
                <ol className="space-y-2">
                  {m.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-medium text-sm">{s.title}</div>
                        <div className="text-sm text-muted-foreground">{s.detail}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Workflow chain */}
              {m.workflow && m.workflow.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-primary" /> Workflow
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {m.workflow.map((w, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Badge variant="secondary" className="rounded-full">
                          {w}
                        </Badge>
                        {i < m.workflow!.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Syncs */}
              {m.syncs && m.syncs.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" /> How data syncs
                  </h4>
                  <ul className="space-y-1">
                    {m.syncs.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        • {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tips */}
              {m.tips && m.tips.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-3">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Lightbulb className="h-4 w-4" /> Tips
                  </h4>
                  <ul className="space-y-1">
                    {m.tips.map((t, i) => (
                      <li key={i} className="text-sm text-amber-800 dark:text-amber-200">
                        • {t}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Video placeholder for future */}
              {m.videoUrl && (
                <div className="aspect-video rounded-md overflow-hidden border">
                  <iframe
                    src={m.videoUrl}
                    className="w-full h-full"
                    title={`${m.name} tutorial`}
                    allow="encrypted-media"
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Need more help?
          </CardTitle>
          <CardDescription>
            This manual is updated continuously. New modules and walkthrough videos will appear here automatically.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
