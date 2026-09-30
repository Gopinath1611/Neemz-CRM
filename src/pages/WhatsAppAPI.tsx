import { useEffect, useMemo, useRef, useState } from "react";
import WhatsAppTemplateMessage from "@/components/whatsapp/WhatsAppTemplateMessage";
import {
  extractSentTemplate,
  seedTemplateDefs,
  resolveTemplateDefs,
  type SentTemplateInfo,
} from "@/lib/whatsappTemplatePreview";
import { checkWhatsAppRecipient, NOT_ON_WHATSAPP_MESSAGE } from "@/lib/whatsappNumberCheck";
import { useClinicMasters } from "@/hooks/useClinicMasters";
import {
  DAILY_SEND_LIMIT,
  audienceBreakdownText,
  buildAudience,
  segmentLabel,
  takeCustomAudience,
  type AudienceResult,
  type CustomAudienceHandover,
  type SegmentKind,
} from "@/lib/whatsappAudience";

import {
  MessageSquare,
  Send,
  TrendingUp,
  Eye,
  Plus,
  Bot,
  FileText,
  Link,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Shield,
  Gauge,
  CreditCard,
  ExternalLink,
  User,
  Phone,
  Globe,
  BarChart3,
  DollarSign,
  RefreshCw,
  AlertCircle,
  Settings,
  Search,
  Paperclip,
  Star,
  Instagram,
  MessageCircle,
  Mail,
  MapPin,
  Pencil,
  Building2,
  ChevronRight,
  Power,
  Copy,
  Tag,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SlidersHorizontal,
  Image as ImageIcon,
  Download,
  Check,
  CheckCheck,
  MailOpen,
  CalendarDays,
  Pin,
  BellOff,
  Archive,
  ArchiveRestore,
  Trash2,
  RotateCcw,
} from "lucide-react";
import CreateTemplateDialog from "@/components/whatsapp/CreateTemplateDialog";
import {
  FailedBreakdownPopoverContent,
  MetricBreakdownPopoverContent,
  useMetricCategoryCounts,
} from "@/components/whatsapp/WhatsAppMetricBreakdown";
import WhatsAppSentDrillDown from "@/components/whatsapp/WhatsAppSentDrillDown";


import { Label } from "@/components/ui/label";
import { Smile, Sticker as StickerIcon, X, Reply, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { WhatsAppTemplatePreview } from "@/components/whatsapp/WhatsAppTemplatePreview";
import WhatsAppDiagnostics from "@/components/whatsapp/WhatsAppDiagnostics";
import WhatsAppSourceAnalytics from "@/components/whatsapp/WhatsAppSourceAnalytics";
import WhatsAppMetaBilling from "@/components/whatsapp/WhatsAppMetaBilling";
import { SmartDateFilter } from "@/components/common/SmartDateFilter";
import { useDateRangeFilter } from "@/components/common/DateRangeFilter";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";

// Local lookup: approved template name -> permanent header image filename served
// from the app's own /public/whatsapp/ folder. Resolved to an absolute URL at runtime
// via window.location.origin so Meta's fetcher receives a fully-qualified HTTPS link.
// Purely client-side. Text-only templates simply won't appear here and fall back gracefully.
const TEMPLATE_HEADER_IMAGE_FILES: Record<string, string> = {
  drneemz_welcome: "drneemz-welcome.jpg",
  implant_treatment: "implant-treatment.jpg",
  invisaligner_treatment: "invisaligner-treatment.png",
  men_dental_implant: "men-dental-implant.png",
  grandma_dental_implant: "grandma-dental-implant.png",
};

// Public Supabase Storage URL for template header media. Meta requires a
// public, unsigned, unredirected HTTPS object returning 200 — the app's own
// preview origin (window.location.origin) can 302/400 for Meta's fetcher and
// triggers error 131053. Assets are pre-uploaded to the public `clinic-assets`
// bucket under `whatsapp/`. Encode the filename so spaces/special chars stay
// valid on the wire.
const WHATSAPP_HEADER_MEDIA_BASE = `${import.meta.env.VITE_SUPABASE_URL || "https://kumtrpubuupvwgbwsqix.supabase.co"}/storage/v1/object/public/clinic-assets/whatsapp`;

const getImageUrl = (filename: string): string => {
  if (!filename) return "";
  return `${WHATSAPP_HEADER_MEDIA_BASE}/${encodeURIComponent(filename)}`;
};

// Back-compat alias: previous code referenced TEMPLATE_HEADER_IMAGE_MAP as a
// name -> absolute URL dictionary. Preserve that shape so existing consumers keep working.
const TEMPLATE_HEADER_IMAGE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATE_HEADER_IMAGE_FILES).map(([name, file]) => [name, getImageUrl(file)]),
);

const getMappedHeaderImageUrl = (templateName?: string | null): string => {
  if (!templateName) return "";
  const file = TEMPLATE_HEADER_IMAGE_FILES[templateName.trim()];
  return file ? getImageUrl(file) : "";
};

const buildHeaderImageComponents = (templateName?: string | null) => {
  const link = getMappedHeaderImageUrl(templateName);
  if (!link) return [] as Array<Record<string, unknown>>;
  return [
    {
      type: "header",
      parameters: [{ type: "image", image: { link } }],
    },
  ];
};

const templateCategories = [
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utility" },
  { value: "authentication", label: "Authentication" },
];

const botRules = [
  {
    id: "1",
    trigger: "hi|hello|hey",
    response:
      "Hello! 👋 Welcome to Dr Neemz Dentistry. How can I help?\n\n1️⃣ Book Appointment\n2️⃣ Treatment Enquiry\n3️⃣ Clinic Hours\n4️⃣ Talk to Staff",
    active: true,
  },
  {
    id: "2",
    trigger: "1|book|appointment",
    response: "Great! Please share your preferred date and time, and we'll check availability. 📅",
    active: true,
  },
  {
    id: "3",
    trigger: "2|treatment|price|cost",
    response:
      "We offer: Cleaning, Fillings, Root Canal, Crowns, Invisalign, Implants & more. Which treatment are you interested in?",
    active: true,
  },
  {
    id: "4",
    trigger: "3|hours|timing|open",
    response: "🕐 Clinic Hours:\nMon-Sat: 9:00 AM - 8:00 PM\nSun: 10:00 AM - 2:00 PM\n📍 Salem, Tamil Nadu",
    active: true,
  },
  { id: "5", trigger: "4|staff|human|agent", response: "Connecting you to our team... Please wait. 🙏", active: true },
];

// Legacy static labels, kept for older campaign rows created before real segments.
const segments = [
  "All Patients",
  "New Leads",
  "Inactive Patients",
  "Completed Treatment",
  "Kids Patients",
  "Invisalign Prospects",
];

type MediaKind = "image" | "sticker" | "video" | "audio" | "document";
type DeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";
type InboxMessage = {
  id: string;
  direction: "in" | "out";
  text: string;
  time: string;
  failed?: boolean;
  attachmentName?: string;
  sticker?: string;
  imageUrl?: string;
  imageKind?: "image" | "sticker";
  mediaUrl?: string;
  mediaKind?: MediaKind;
  mediaMime?: string;
  mediaFilename?: string;
  templateName?: string;
  buttonUrlParams?: string[];
  templateInfo?: SentTemplateInfo;
  status?: DeliveryStatus;
  errorReason?: string;
};
type InboxThread = {
  id: string;
  name: string;
  initials: string;
  phone: string;
  preview: string;
  time: string;
  online: boolean;
  platform: "whatsapp" | "instagram";
  unreadCount: number;
  starred: boolean;
  lastMessageAt?: string;
  deletedAt?: string | null;
  dbId?: string;
};

type LiveInsightsResponse = {
  live: boolean;
  connectionVerified: boolean;
  connectionExists: boolean;
  error?: string;
  provider?: string;
  connection?: {
    provider?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    hasAccessToken?: boolean;
    baseUrl?: string | null;
  };
  accountHealth?: {
    status?: string | null;
    accountMode?: string | null;
    messageHealth?: string | null;
    qualityRating?: string | null;
    qualityScore?: number;
    messagingTier?: string | number | null;
    dailyLimit?: number;
    sentToday?: number;
    remainingQuota?: number;
    displayName?: string | null;
    phoneNumber?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    lastSyncedAt?: string | null;
    nameStatus?: string | null;
    verificationStatus?: string | null;
    searchVisibility?: string | null;
    platformType?: string | null;
    officialBusinessAccount?: boolean;
    reviewStatus?: string | null;
  };
  analytics30d?: {
    totalSent?: number;
    delivered?: number;
    read?: number;
    responded?: number;
    failed?: number;
    optOut?: number;
    deliveryRate?: number;
    readRate?: number;
    responseRate?: number;
  };
  pricing?: {
    available?: boolean;
    currency?: string;
    currentMonthSpend?: number;
    breakdown?: Array<{
      category: string;
      count: number;
      rate: number;
      currency: string;
      totalCost: number;
    }>;
  };
  messageThreads?: Array<{
    type: string;
    count: number;
    percent: number;
  }>;
  businessProfile?: {
    displayName?: string | null;
    phoneNumber?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    provider?: string | null;
    baseUrl?: string | null;
  };
};

const formatCount = (value?: number | null) => new Intl.NumberFormat("en-IN").format(value || 0);
const formatMoney = (value?: number | null, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
const pct = (value?: number | null) => `${value ?? 0}%`;
const labelize = (value?: string | number | null) => {
  if (value == null || value === "") return "—";
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
};

async function downloadMedia(url: string, filename?: string, fallbackExt?: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename || `download.${fallbackExt || "bin"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type MetaErrorInfo = { meaning: string; troubleshoot: string };

const META_ERROR_DICTIONARY: Record<string, MetaErrorInfo> = {
  "130429": {
    meaning: "Rate limit hit",
    troubleshoot:
      "Wait a few minutes before retrying. If this persists, check your messaging tier and daily quota in Meta Business settings.",
  },
  "131009": {
    meaning: "Missing or invalid parameter",
    troubleshoot:
      "Verify that all template variables and payload parameters are correctly populated and match the template definition.",
  },
  "131021": {
    meaning: "Message type not supported",
    troubleshoot:
      "Use a supported message type (text, image, document, template, etc.) for the current recipient context.",
  },
  "131026": {
    meaning: "Message Undeliverable — Recipient is not on WhatsApp or number is invalid",
    troubleshoot:
      "Confirm the phone number includes the correct country code and is registered on WhatsApp. Remove or correct invalid numbers from your list.",
  },
  "131030": {
    meaning: "Recipient cannot be the sender",
    troubleshoot: "Ensure you are not trying to send a message to your own WhatsApp Business phone number.",
  },
  "131031": {
    meaning: "Too many messages in a short time",
    troubleshoot: "Slow down the send rate or spread messages across a longer window to stay within Meta limits.",
  },
  "131032": {
    meaning: "Account locked or restricted",
    troubleshoot:
      "Review Meta Business Account status and any policy notifications. Contact Meta support if the account is suspended.",
  },
  "131033": {
    meaning: "Phone number not registered on WhatsApp",
    troubleshoot: "Ask the recipient to register the number on WhatsApp, or remove the number from your outreach list.",
  },
  "131034": {
    meaning: "Template paused",
    troubleshoot: "Go to Meta WhatsApp Manager, review the template status, and resume or recreate the template.",
  },
  "131035": {
    meaning: "Template disabled",
    troubleshoot: "Recreate the template in WhatsApp Manager or choose an alternative approved template.",
  },
  "131036": {
    meaning: "Template category change required",
    troubleshoot:
      "Re-submit the template under the correct category (Utility, Marketing, Authentication) in Meta WhatsApp Manager.",
  },
  "131037": {
    meaning: "Phone number quality rating is low",
    troubleshoot:
      "Reduce spam-like messaging, improve template quality, and monitor the quality score in Meta Business Manager.",
  },
  "131038": {
    meaning: "Phone number restricted",
    troubleshoot: "Check Meta restrictions on this phone number and follow any required appeal or cleanup process.",
  },
  "131039": {
    meaning: "Business phone number not fully set up",
    troubleshoot: "Complete the WhatsApp Business phone number setup and verification in Meta Business Manager.",
  },
  "131040": {
    meaning: "Invalid message format",
    troubleshoot: "Validate the JSON payload against Meta's Cloud API message schema before sending.",
  },
  "131041": {
    meaning: "Invalid recipient",
    troubleshoot: "Check that the recipient ID is a valid WhatsApp number with country code and no extra characters.",
  },
  "131042": {
    meaning: "Rate limit reached or billing threshold exceeded",
    troubleshoot:
      "Wait before retrying, or increase your messaging tier / payment threshold in Meta Business settings.",
  },
  "131043": {
    meaning: "Message failed to send",
    troubleshoot:
      "Retry the message. If it keeps failing, inspect the full Meta payload for a more specific error code.",
  },
  "131044": {
    meaning: "Cannot send message to this user",
    troubleshoot:
      "The user may have blocked your number or opted out. Remove them from active campaigns if opt-out is confirmed.",
  },
  "131045": {
    meaning: "User opted out",
    troubleshoot: "Stop messaging this number and respect the opt-out. Remove it from future campaign lists.",
  },
  "131046": {
    meaning: "Message too long",
    troubleshoot: "Shorten the message body or split it into multiple smaller messages.",
  },
  "131047": {
    meaning: "24-hour window expired — Template required",
    troubleshoot:
      "Use an approved template message instead of a free-form message when the customer has not replied within 24 hours.",
  },
  "131048": {
    meaning: "Invalid template",
    troubleshoot: "Verify the template name, language code, and parameters match an approved template exactly.",
  },
  "131049": {
    meaning: "Template language not supported",
    troubleshoot: "Use a language/locale that is enabled for the selected template in WhatsApp Manager.",
  },
  "131050": {
    meaning: "Template content violates Meta policy",
    troubleshoot:
      "Edit the template to comply with Meta's WhatsApp Business Messaging Policy and re-submit for approval.",
  },
  "131051": {
    meaning: "Message content violates policies",
    troubleshoot: "Remove prohibited content (spam, disallowed products, etc.) and retry with compliant messaging.",
  },
  "131052": {
    meaning: "Media upload or download failed",
    troubleshoot: "Check the media URL is publicly accessible, uses HTTPS, and the file is not corrupted.",
  },
  "131053": {
    meaning: "Media URL is invalid or unreachable",
    troubleshoot: "Use a direct, publicly reachable HTTPS URL that returns the media file with a valid content type.",
  },
  "131054": {
    meaning: "Media type unsupported",
    troubleshoot: "Convert the file to a supported type (image: jpg/png, video: mp4, audio: ogg/mp3, document: pdf).",
  },
  "131055": {
    meaning: "Media file too large",
    troubleshoot:
      "Reduce the file size to within Meta's limits (images 5 MB, videos 16 MB, documents 100 MB, audio 16 MB).",
  },
  "131056": {
    meaning: "Billing or payment issue with Meta account",
    troubleshoot:
      "Check your Meta Business payment method, outstanding invoices, and spending limit in Meta Payment Settings.",
  },
  "131057": {
    meaning: "Template parameter mismatch",
    troubleshoot: "Ensure the number and type of parameters sent exactly match the approved template definition.",
  },
  "131058": {
    meaning: "Template not found",
    troubleshoot: "Confirm the template name and language code. Re-sync templates from Meta if recently approved.",
  },
  "132001": {
    meaning: "Template not approved or invalid",
    troubleshoot: "Use a template that shows 'APPROVED' in Meta WhatsApp Manager and verify the name/language exactly.",
  },
  "132005": {
    meaning: "Template parameter invalid",
    troubleshoot: "Check that all {{variables}} in the template are supplied with valid, non-empty values.",
  },
  "132007": {
    meaning: "Template text component mismatch",
    troubleshoot: "Match the template body text and variables exactly as defined in the approved template.",
  },
  "132008": {
    meaning: "Template header/media mismatch",
    troubleshoot: "Provide the correct header media (image, document, video) if the template includes a header.",
  },
  "133000": {
    meaning: "Business account not found",
    troubleshoot: "Verify the WABA ID and that the Meta Business account is active and linked to this app.",
  },
  "133001": {
    meaning: "Phone number not found",
    troubleshoot: "Confirm the Phone Number ID is correct and belongs to the connected WhatsApp Business account.",
  },
  "133002": {
    meaning: "Access token invalid or expired",
    troubleshoot:
      "Generate a new permanent access token from Meta Business settings and update it in the connection dialog.",
  },
};

const getMetaErrorInfo = (code?: string | number | null, fallbackReason?: string | null): MetaErrorInfo => {
  const key = code != null ? String(code) : "";
  if (key && META_ERROR_DICTIONARY[key]) return META_ERROR_DICTIONARY[key];
  if (!fallbackReason)
    return { meaning: "Meta API Error", troubleshoot: "Please check the webhook payload for details." };
  return {
    meaning: fallbackReason,
    troubleshoot: "No additional guidance available for this error. Inspect the Meta payload for more details.",
  };
};

const getFriendlyError = (errorReason?: string | null): string => {
  if (!errorReason) return "Failed";
  const codeMatch = errorReason.match(
    /\b(130429|131009|131021|131026|131030|131031|131032|131033|131034|131035|131036|131037|131038|131039|131040|131041|131042|131043|131044|131045|131046|131047|131048|131049|131050|131051|131052|131053|131054|131055|131056|131057|131058|132001|132005|132007|132008|133000|133001|133002)\b/,
  );
  return codeMatch ? META_ERROR_DICTIONARY[codeMatch[1]].meaning : errorReason;
};

const extensionFromMime = (mime?: string) => {
  if (!mime) return undefined;
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "application/pdf": "pdf",
  };
  return map[mime] || mime.split("/").pop();
};

const WhatsAppAPI = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const clinicScope = location.pathname.startsWith("/clinic-whatsapp");
  const allowedTabs = clinicScope ? new Set(["inbox", "single-send"]) : null;
  const initialTab = clinicScope ? (location.pathname.includes("single-send") ? "single-send" : "inbox") : "account";
  const [activeTab, setActiveTab] = useState(initialTab);
  useEffect(() => {
    if (!clinicScope) return;
    setActiveTab(location.pathname.includes("single-send") ? "single-send" : "inbox");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [botOpen, setBotOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    message_template: "",
    campaign_type: "promotion",
    target_segment: "",
    total_recipients: "0",
  });
  // ---- Campaign audience (real Patients / Leads segments) ----
  const { treatmentNames } = useClinicMasters();
  const [segmentKind, setSegmentKind] = useState<SegmentKind | "">("");
  const [segmentTreatment, setSegmentTreatment] = useState("");
  const [customAudience, setCustomAudience] = useState<CustomAudienceHandover | null>(null);
  const [audience, setAudience] = useState<AudienceResult | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);
  const [campaignTemplateName, setCampaignTemplateName] = useState("");

  const resetCampaignForm = () => {
    setForm({ name: "", message_template: "", campaign_type: "promotion", target_segment: "", total_recipients: "0" });
    setSegmentKind("");
    setSegmentTreatment("");
    setCustomAudience(null);
    setAudience(null);
    setAudienceError(null);
    setCampaignTemplateName("");
  };

  // A custom list handed over from Patient Database / Contacts.
  useEffect(() => {
    const handover = takeCustomAudience();
    if (!handover) return;
    setCustomAudience(handover);
    setSegmentKind("custom");
    setCampaignOpen(true);
  }, []);

  useEffect(() => {
    if (!segmentKind) {
      setAudience(null);
      return;
    }
    if (segmentKind === "treatment" && !segmentTreatment) {
      setAudience(null);
      return;
    }
    let cancelled = false;
    setAudienceLoading(true);
    setAudienceError(null);
    buildAudience(segmentKind as SegmentKind, { treatment: segmentTreatment, custom: customAudience })
      .then((result) => {
        if (cancelled) return;
        setAudience(result);
        setForm((f) => ({
          ...f,
          target_segment: result.descriptor,
          total_recipients: String(result.contacts.length),
        }));
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setAudience(null);
          setAudienceError(err.message || "Could not build the audience");
        }
      })
      .finally(() => {
        if (!cancelled) setAudienceLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentKind, segmentTreatment, customAudience]);
  const [templateForm, setTemplateForm] = useState<{
    name: string;
    category: string;
    language: string;
    body: string;
    bodyExamples: string[];
  }>({ name: "", category: "utility", language: "en_US", body: "", bodyExamples: [] });
  const [botForm, setBotForm] = useState({ trigger: "", response: "" });
  const [apiConfig, setApiConfig] = useState({
    provider: "Meta Cloud API",
    apiUrl: "https://graph.facebook.com/v22.0",
    phoneNumberId: "",
    wabaId: "",
    accessToken: "",
    webhookToken: "",
  });
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, InboxMessage[]>>({});
  const [loadingThreadKey, setLoadingThreadKey] = useState<string | null>(null);
  const fullyLoadedThreadsRef = useRef<Set<string>>(new Set());
  const selectedChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);
  const [draftMessage, setDraftMessage] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [newMessageContact, setNewMessageContact] = useState<string>("");
  const [newMessageSearch, setNewMessageSearch] = useState("");
  const [inboxSearch, setInboxSearch] = useState("");
  const [singleSend, setSingleSend] = useState({ recipient: "", customerName: "", templateName: "", message: "" });
  // Pre-send recipient validation (format + auto-blacklisted 131026 numbers).
  const [recipientCheck, setRecipientCheck] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [checkingRecipient, setCheckingRecipient] = useState(false);

  const [singleParams, setSingleParams] = useState<string[]>([]);
  const [singleHeaderImageUrl, setSingleHeaderImageUrl] = useState<string>("");
  const [lastSend, setLastSend] = useState<{
    messageId: string;
    to: string;
    status: string;
    statusAt: string;
    error?: any;
    errorCode?: number | null;
    errorMessage?: string | null;
  } | null>(null);

  const [sendingSingle, setSendingSingle] = useState(false);
  const [sendingDraft, setSendingDraft] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{
    kind: "image" | "document" | "video" | "audio" | "sticker";
    name: string;
    mime: string;
    dataUrl: string; // full data:...;base64,... for preview + base64 extraction
  } | null>(null);
  const [singleMedia, setSingleMedia] = useState<{
    kind: "image" | "document" | "video" | "audio";
    name: string;
    mime: string;
    dataUrl: string;
  } | null>(null);
  const [singleHeaderMediaUrl, setSingleHeaderMediaUrl] = useState<string>("");
  const [activeInboxFilter, setActiveInboxFilter] = useState<
    "starred" | "all" | "unread" | "wa_groups" | "archived" | "trash"
  >("all");
  const [metricFilter, setMetricFilter] = useState<null | "sent" | "delivered" | "read" | "failed" | "pending" | "responses">(null);
  const [failedDetailOpen, setFailedDetailOpen] = useState(false);
  const [failedAllTime, setFailedAllTime] = useState(false);
  const [metricDetail, setMetricDetail] = useState<null | "sent" | "delivered" | "read" | "responses">(null);
  const [metricDetailAllTime, setMetricDetailAllTime] = useState(false);
  const [inboxFilters, setInboxFilters] = useState<{
    channels: string[];
    assignedTo: string;
    direction: string;
    outboundType: string;
  }>({ channels: [], assignedTo: "", direction: "", outboundType: "" });
  const [inboxDatePreset, setInboxDatePreset] = useState<"all" | "today" | "yesterday" | "last7" | "custom">(() => {
    try {
      return (window.localStorage.getItem("wa_inbox_date_preset") as any) || "all";
    } catch {
      return "all";
    }
  });
  const [inboxCustomFrom, setInboxCustomFrom] = useState<string>(() => {
    try {
      return window.localStorage.getItem("wa_inbox_date_from") || "";
    } catch {
      return "";
    }
  });
  const [inboxCustomTo, setInboxCustomTo] = useState<string>(() => {
    try {
      return window.localStorage.getItem("wa_inbox_date_to") || "";
    } catch {
      return "";
    }
  });
  const [manualUnreadThreadIds, setManualUnreadThreadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("wa_manual_unread_threads") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_inbox_date_preset", inboxDatePreset);
    } catch {}
  }, [inboxDatePreset]);
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_inbox_date_from", inboxCustomFrom);
    } catch {}
  }, [inboxCustomFrom]);
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_inbox_date_to", inboxCustomTo);
    } catch {}
  }, [inboxCustomTo]);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("wa_pinned_threads") || "[]");
    } catch {
      return [];
    }
  });
  const [mutedThreadIds, setMutedThreadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("wa_muted_threads") || "[]");
    } catch {
      return [];
    }
  });
  const [archivedThreadIds, setArchivedThreadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("wa_archived_threads") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_pinned_threads", JSON.stringify(pinnedThreadIds));
    } catch {}
  }, [pinnedThreadIds]);
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_muted_threads", JSON.stringify(mutedThreadIds));
    } catch {}
  }, [mutedThreadIds]);
  useEffect(() => {
    try {
      window.localStorage.setItem("wa_archived_threads", JSON.stringify(archivedThreadIds));
    } catch {}
  }, [archivedThreadIds]);
  const togglePinThread = (id: string) =>
    setPinnedThreadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleMuteThread = (id: string) =>
    setMutedThreadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleArchiveThread = (id: string) =>
    setArchivedThreadIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleSoftDeleteThread = async (thread: InboxThread) => {
    if (!thread.dbId) return;
    const nextDeleted = thread.deletedAt ? null : new Date().toISOString();
    setDynamicThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, deletedAt: nextDeleted } : t)));
    const { error } = await supabase.from("whatsapp_threads").update({ deleted_at: nextDeleted }).eq("id", thread.dbId);
    if (error) {
      setDynamicThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, deletedAt: thread.deletedAt ?? null } : t)),
      );
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: nextDeleted ? "Conversation moved to Trash" : "Conversation restored" });
  };
  const [dynamicThreads, setDynamicThreads] = useState<InboxThread[]>([]);
  const [inboxTotalCount, setInboxTotalCount] = useState<number | null>(null);
  const [inboxLoadedCount, setInboxLoadedCount] = useState(100);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const inboxLoadedCountRef = useRef(100);
  useEffect(() => {
    inboxLoadedCountRef.current = inboxLoadedCount;
  }, [inboxLoadedCount]);
  const [sendMode, setSendMode] = useState<"text" | "template">("text");
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
  const [customTemplateMode, setCustomTemplateMode] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [customTemplateLang, setCustomTemplateLang] = useState("en_US");
  // NOTE: Header image URL is no longer collected from the UI — the backend
  // resolves the correct header media automatically from whatsapp_templates.

  const [templates, setTemplates] = useState<any[]>([]);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [viewTemplate, setViewTemplate] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState<{
    open: boolean;
    url?: string;
    kind?: MediaKind;
    mime?: string;
    filename?: string;
  }>({ open: false });
  const approvedTemplates = useMemo(() => templates.filter((t) => t.status === "approved"), [templates]);
  // Share the loaded template definitions with the lead-scoped chat renderer.
  useEffect(() => {
    seedTemplateDefs(templates);
  }, [templates]);

  // Templates tab UI controls (client-side only)
  const [tplSearchDraft, setTplSearchDraft] = useState("");
  const [tplStatusDraft, setTplStatusDraft] = useState<string>("all");
  const [tplLangDraft, setTplLangDraft] = useState<string>("all");
  const [tplSortDraft, setTplSortDraft] = useState<string>("latest");
  const [tplPerPageDraft, setTplPerPageDraft] = useState<string>("15");
  const [tplSearch, setTplSearch] = useState("");
  const [tplStatus, setTplStatus] = useState<string>("all");
  const [tplLang, setTplLang] = useState<string>("all");
  const [tplSort, setTplSort] = useState<string>("latest");
  const [tplPerPage, setTplPerPage] = useState<number>(15);

  const tplLanguageOptions = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.language) set.add(t.language);
    });
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const q = tplSearch.trim().toLowerCase();
    let list = templates.filter((t) => {
      if (q && !`${t.name} ${t.category || ""}`.toLowerCase().includes(q)) return false;
      if (tplStatus !== "all" && String(t.status).toLowerCase() !== tplStatus) return false;
      if (tplLang !== "all" && t.language !== tplLang) return false;
      return true;
    });
    const idx = (t: any) => templates.indexOf(t);
    list = [...list].sort((a, b) => {
      if (tplSort === "az") return String(a.name).localeCompare(String(b.name));
      if (tplSort === "za") return String(b.name).localeCompare(String(a.name));
      if (tplSort === "oldest") return idx(a) - idx(b);
      return idx(b) - idx(a); // latest
    });
    return list.slice(0, tplPerPage);
  }, [templates, tplSearch, tplStatus, tplLang, tplSort, tplPerPage]);

  const applyTplFilters = () => {
    setTplSearch(tplSearchDraft);
    setTplStatus(tplStatusDraft);
    setTplLang(tplLangDraft);
    setTplSort(tplSortDraft);
    setTplPerPage(Number(tplPerPageDraft) || 15);
  };
  const resetTplFilters = () => {
    setTplSearchDraft("");
    setTplStatusDraft("all");
    setTplLangDraft("all");
    setTplSortDraft("latest");
    setTplPerPageDraft("15");
    setTplSearch("");
    setTplStatus("all");
    setTplLang("all");
    setTplSort("latest");
    setTplPerPage(15);
  };

  const handleEditTemplate = (t: any) => {
    setTemplateForm({
      name: t.name,
      category: t.category || "utility",
      language: t.language || "en_US",
      body: t.body || "",
      bodyExamples: Array.isArray(t.body_examples) ? t.body_examples : [],
      headerFormat: t.header_format || "NONE",
      headerText: t.header_text || "",
      headerExample: t.header_example || "",
      footerText: t.footer_text || "",
      buttons: Array.isArray(t.buttons) ? t.buttons : [],
    } as any);
    setTemplateOpen(true);
  };
  const handleDeleteTemplate = async (t: any) => {
    if (!window.confirm(`Delete "${t.name}" from Meta AND this app? This cannot be undone.`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-delete-template", {
        body: { name: t.name, language: t.language },
      });
      if (error) throw new Error((error as any)?.message || "Delete request failed");
      if (!data?.ok) {
        toast({
          title: `Could not delete "${t.name}" on Meta`,
          description: data?.error || "Meta rejected the delete. Local copy kept for now — try Sync Status.",
          variant: "destructive",
        });
        return;
      }
      setTemplates((prev) => prev.filter((x) => !(x.name === t.name && (!t.language || x.language === t.language))));
      toast({
        title: `Deleted "${t.name}"`,
        description: data?.purgedLocalOnly
          ? "Not present on Meta — removed local record."
          : "Removed from Meta and this app.",
      });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message || "Unexpected error", variant: "destructive" });
    }
  };

  const countPlaceholders = (s: string): number => {
    const matches = (s || "").match(/\{\{\s*(\d+)\s*\}\}/g) || [];
    const nums = matches.map((m) => Number(m.replace(/[^\d]/g, ""))).filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) : 0;
  };
  // Approved-template rows in the DB sometimes have an empty body/components.
  // Resolve the richer Meta definition so the Single Send preview never stays blank.
  const [resolvedSingleDef, setResolvedSingleDef] = useState<any>(null);
  useEffect(() => {
    const name = singleSend.templateName;
    if (!name) {
      setResolvedSingleDef(null);
      return;
    }
    let cancelled = false;
    resolveTemplateDefs([name])
      .then((map) => {
        if (!cancelled) setResolvedSingleDef(map.get(name) || null);
      })
      .catch(() => {
        if (!cancelled) setResolvedSingleDef(null);
      });
    return () => {
      cancelled = true;
    };
  }, [singleSend.templateName]);

  const singleTemplate = useMemo<any>(() => {
    const name = singleSend.templateName;
    if (!name) return null;
    const row: any = approvedTemplates.find((x) => x.name === name) || null;
    const def: any = resolvedSingleDef;
    const body = String(row?.body || "").trim() || String(def?.body || "").trim() || String(singleSend.message || "");
    if (!row && !def && !body) return null;
    return {
      name,
      category: row?.category || def?.category,
      language: row?.language || def?.language,
      body,
      header_format: row?.header_format || def?.header_format,
      header_text: row?.header_text || def?.header_text,
      header_example: row?.header_media_url || row?.header_example || def?.header_example,
      footer_text: row?.footer_text || def?.footer_text,
      buttons: (Array.isArray(row?.buttons) && row.buttons.length ? row.buttons : def?.buttons) || [],
    };
  }, [approvedTemplates, resolvedSingleDef, singleSend.templateName, singleSend.message]);

  const singleTemplateParamCount = useMemo(() => countPlaceholders(singleTemplate?.body || ""), [singleTemplate]);
  const singleTemplateHeaderFormat = useMemo(() => {
    return String((singleTemplate as any)?.header_format || "").toUpperCase();
  }, [singleTemplate]);

  const chatTemplateHeaderFormat = useMemo(() => {
    if (customTemplateMode) return "";
    const t: any = approvedTemplates.find((x) => x.name === selectedTemplateName);
    return String(t?.header_format || "").toUpperCase();
  }, [approvedTemplates, selectedTemplateName, customTemplateMode]);

  const syncTemplateStatuses = async () => {
    setSyncingTemplates(true);
    try {
      const authHeaders = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("whatsapp-list-templates", { body: {}, headers: authHeaders });
      if (error) {
        const ctx: any = (error as any).context;
        let parsed: any = null;
        try {
          parsed = ctx && typeof ctx.text === "function" ? JSON.parse(await ctx.text()) : null;
        } catch {
          /* ignore */
        }
        throw new Error(parsed?.error || (error as any).message || "Failed to sync templates");
      }
      if (!data?.ok) throw new Error(data?.error || "Failed to sync templates");
      const live: Array<{
        name: string;
        status: string;
        category?: string;
        language?: string;
        body?: string;
        header_format?: string;
        header_text?: string;
        header_example?: string;
        footer_text?: string;
        buttons?: any[];
      }> = data.templates || [];
      if (live.length === 0) {
        toast({ title: "No templates returned from Meta." });
        return;
      }
      setTemplates((prev) => {
        const syncedAt = new Date().toISOString();
        const keyOf = (t: any) => `${t.name}::${String(t.language || "").toLowerCase()}`;
        const liveKeys = new Set(live.map((l) => `${l.name}::${String(l.language || "").toLowerCase()}`));
        const liveNames = new Set(live.map((l) => l.name));
        // Drop stale local rows whose (name+lang) is gone from Meta but the template
        // still exists under a different locale (e.g. old en_US row when Meta now has en).
        // Rows for templates Meta no longer returns at all are demoted to rejected.
        const demoted = prev
          .filter((t) => (liveNames.has(t.name) ? liveKeys.has(keyOf(t)) : true))
          .map((t) => (liveNames.has(t.name) ? t : { ...t, status: "rejected" }));
        const byKey = new Map(demoted.map((t) => [keyOf(t), t] as const));
        live.forEach((lt) => {
          const status = String(lt.status || "").toLowerCase();
          const k = `${lt.name}::${String(lt.language || "").toLowerCase()}`;
          const existing: any = byKey.get(k);
          if (existing) {
            byKey.set(k, {
              ...existing,
              status,
              category: lt.category || existing.category,
              language: lt.language || existing.language,
              body: lt.body ?? existing.body,
              header_format: lt.header_format ?? existing.header_format,
              header_text: lt.header_text ?? existing.header_text,
              header_example: lt.header_example ?? existing.header_example,
              footer_text: lt.footer_text ?? existing.footer_text,
              buttons: lt.buttons ?? existing.buttons,
              last_synced: syncedAt,
            });
          } else {
            byKey.set(k, {
              id: `meta-${lt.name}-${lt.language || "en"}`,
              name: lt.name,
              category: lt.category || "utility",
              status,
              language: lt.language || "en",
              body: lt.body || "",
              header_format: lt.header_format || "",
              header_text: lt.header_text || "",
              header_example: lt.header_example || "",
              footer_text: lt.footer_text || "",
              buttons: lt.buttons || [],
              last_synced: syncedAt,
            } as any);
          }
        });

        return Array.from(byKey.values());
      });
      setLastSyncedAt(new Date().toISOString());
      toast({ title: `Synced ${live.length} template${live.length === 1 ? "" : "s"} from Meta.` });
    } catch (e: any) {
      toast({ title: "Sync failed", description: e?.message || "Could not reach Meta.", variant: "destructive" });
    } finally {
      setSyncingTemplates(false);
    }
  };

  const hasInboundInLast24h = useMemo(() => {
    if (!selectedChatId) return false;
    const msgs = chatMessages[selectedChatId] || [];
    return msgs.some((m) => m.direction === "in");
  }, [selectedChatId, chatMessages]);

  const [clearedThreadIds, setClearedThreadIds] = useState<string[]>([]);
  const [starredThreadIds, setStarredThreadIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("wa_starred_threads");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const toggleStarThread = (threadId: string) => {
    setStarredThreadIds((prev) => {
      const next = prev.includes(threadId) ? prev.filter((id) => id !== threadId) : [...prev, threadId];
      try {
        window.localStorage.setItem("wa_starred_threads", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const markThreadReadLocally = (threadId: string) => {
    setClearedThreadIds((prev) => (prev.includes(threadId) ? prev : [...prev, threadId]));
    setDynamicThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t)));
    setManualUnreadThreadIds((prev) => {
      if (!prev.includes(threadId)) return prev;
      const next = prev.filter((id) => id !== threadId);
      try {
        window.localStorage.setItem("wa_manual_unread_threads", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleThreadReadState = (threadId: string, currentlyUnread: boolean) => {
    if (currentlyUnread) {
      markThreadReadLocally(threadId);
      if (threadId.startsWith("wa-")) {
        const dbId = threadId.slice(3);
        supabase
          .from("whatsapp_threads")
          .update({ unread_count: 0 })
          .eq("id", dbId)
          .then(() => {});
        supabase
          .from("whatsapp_messages")
          .update({ is_read: true })
          .eq("thread_id", dbId)
          .then(() => {});
      }
    } else {
      setManualUnreadThreadIds((prev) => {
        if (prev.includes(threadId)) return prev;
        const next = [...prev, threadId];
        try {
          window.localStorage.setItem("wa_manual_unread_threads", JSON.stringify(next));
        } catch {}
        return next;
      });
      setClearedThreadIds((prev) => prev.filter((id) => id !== threadId));
    }
  };

  const handleSelectThread = (threadId: string) => {
    markThreadReadLocally(threadId);
    setSelectedChatId(threadId);
  };

  useEffect(() => {
    if (!selectedChatId) return;
    setSelectedTemplateName("");
    setSendMode("text");
    // Auto-mark thread as read when opened
    markThreadReadLocally(selectedChatId);
    if (selectedChatId.startsWith("wa-")) {
      // Always pull the full history for the opened conversation.
      loadThreadMessages(selectedChatId);
      const threadDbId = selectedChatId.slice(3);
      Promise.all([
        supabase.from("whatsapp_threads").update({ unread_count: 0 }).eq("id", threadDbId),
        supabase.from("whatsapp_messages").update({ is_read: true }).eq("thread_id", threadDbId),
      ]).then((results) => {
        const error = results.find((result) => result.error)?.error;
        if (error) console.warn("[inbox] mark-read failed", error);
        else setClearedThreadIds((prev) => prev.filter((id) => id !== selectedChatId));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  // Auto-refresh templates from Meta the first time the Templates tab is opened
  // so preview cards reflect the latest approved locale (e.g. en 5-param invoice).
  useEffect(() => {
    if (activeTab === "templates" && !lastSyncedAt && !syncingTemplates) {
      syncTemplateStatuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ---- Live WhatsApp inbox (real inbound messages via webhook) ----
  // Shared row -> bubble mapper so the bulk inbox load and the per-thread
  // load render identical message bubbles.
  const mapMessageRows = (rows: any[]): InboxMessage[] => {
    const mediaProxyBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-media`;
    return (
      (rows || [])
        // Hide messages deleted for me; keep revoked ones as a tombstone bubble.
        .filter((m: any) => !m.deleted_at || m.deleted_for_everyone)
        .map((m: any) => {
          if (m.deleted_for_everyone) {
            return {
              id: m.id,
              direction: (m.direction === "out" ? "out" : "in") as "in" | "out",
              text: "🚫 This message was deleted",
              time: m.received_at
                ? new Date(m.received_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "",
            };
          }
          const p = m.payload || {};
          const kind: MediaKind | undefined =
            (p._media_kind as MediaKind) ||
            (p.image
              ? "image"
              : p.sticker
                ? "sticker"
                : p.video
                  ? "video"
                  : p.audio
                    ? "audio"
                    : p.document
                      ? "document"
                      : undefined);
          const mediaId: string | undefined =
            p._media_id || p.image?.id || p.sticker?.id || p.video?.id || p.audio?.id || p.document?.id;
          const mediaMime: string | undefined =
            p._media_mime ||
            p.image?.mime_type ||
            p.video?.mime_type ||
            p.audio?.mime_type ||
            p.document?.mime_type ||
            p.sticker?.mime_type;
          const mediaFilename: string | undefined = p._media_filename || p.document?.filename;
          const isImg = kind === "image" || kind === "sticker";
          const mediaUrl = kind && mediaId ? `${mediaProxyBase}?id=${encodeURIComponent(mediaId)}` : undefined;
          // Extract outbound template metadata so we can render the interactive
          // buttons that were actually sent (buttons themselves are static in
          // the template definition and looked up by name at render time).
          const req: any = p.request || {};
          const templateName: string | undefined = req?.template?.name;
          const buttonUrlParams: string[] = Array.isArray(req?.template?.components)
            ? req.template.components
                .filter(
                  (c: any) => String(c?.type).toLowerCase() === "button" && String(c?.sub_type).toLowerCase() === "url",
                )
                .map((c: any) => {
                  const param = Array.isArray(c?.parameters) ? c.parameters[0] : null;
                  return String(param?.text ?? param?.payload ?? "");
                })
            : [];
          const rawStatus = String(m.status || "").toLowerCase();
          const mappedStatus: DeliveryStatus | undefined =
            m.direction === "out"
              ? rawStatus === "read"
                ? "read"
                : rawStatus === "delivered"
                  ? "delivered"
                  : rawStatus === "sent"
                    ? "sent"
                    : rawStatus === "failed" || rawStatus === "undeliverable"
                      ? "failed"
                      : rawStatus === "accepted" || rawStatus === "queued" || rawStatus === ""
                        ? "sending"
                        : "sent"
              : undefined;
          const errText = (() => {
            const e: any = m.error;
            if (!e) return undefined;
            if (typeof e === "string") return e;
            if (Array.isArray(e))
              return (
                e
                  .map((x: any) => x?.title || x?.message || x?.error_data?.details || "")
                  .filter(Boolean)
                  .join("; ") || undefined
              );
            return e?.title || e?.message || undefined;
          })();
          return {
            id: m.id,
            direction: (m.direction === "out" ? "out" : "in") as "in" | "out",
            text: m.text || "",
            time: m.received_at
              ? new Date(m.received_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "",
            ...(isImg && mediaUrl ? { imageUrl: mediaUrl, imageKind: kind as "image" | "sticker" } : {}),
            ...(kind && mediaUrl ? { mediaUrl, mediaKind: kind, mediaMime, mediaFilename } : {}),
            ...(templateName ? { templateName } : {}),
            ...(buttonUrlParams.length ? { buttonUrlParams } : {}),
            ...(extractSentTemplate(p) ? { templateInfo: extractSentTemplate(p)! } : {}),
            ...(mappedStatus ? { status: mappedStatus, failed: mappedStatus === "failed" } : {}),
            ...(errText ? { errorReason: errText } : {}),
          } as InboxMessage;
        })
    );
  };

  const MESSAGE_COLUMNS =
    "id, thread_id, direction, text, received_at, payload, status, error, deleted_at, deleted_for_everyone";

  // Loads the complete history for a single thread. The bulk inbox query is
  // capped by PostgREST's row limit, so an individual fetch is required to
  // guarantee the right-hand panel shows every message for the opened chat.
  const loadThreadMessages = async (threadKey: string) => {
    if (!threadKey.startsWith("wa-")) return;
    const threadDbId = threadKey.slice(3);
    setLoadingThreadKey(threadKey);
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .eq("thread_id", threadDbId)
      .order("received_at", { ascending: true })
      .limit(1000);
    if (error) {
      console.warn("[inbox] thread history load failed", error);
      setLoadingThreadKey((prev) => (prev === threadKey ? null : prev));
      return;
    }
    setChatMessages((prev) => ({ ...prev, [threadKey]: mapMessageRows(data || []) }));
    fullyLoadedThreadsRef.current.add(threadKey);
    setLoadingThreadKey((prev) => (prev === threadKey ? null : prev));
  };

  const loadWhatsAppInbox = async () => {
    const wanted = inboxLoadedCountRef.current;
    // True total for the "All" badge (cheap head-only count).
    supabase
      .from("whatsapp_threads")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        if (typeof count === "number") setInboxTotalCount(count);
      });
    // Fetch in chunks of 1000 (PostgREST row cap) up to the loaded-page target.
    const threads: any[] = [];
    for (let from = 0; from < wanted; from += 1000) {
      const { data } = await supabase
        .from("whatsapp_threads")
        .select("id, wa_phone, display_name, last_message, last_message_at, unread_count, deleted_at")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(from, Math.min(from + 999, wanted - 1));
      if (!data?.length) break;
      threads.push(...data);
      if (data.length < 1000) break;
    }
    if (!threads.length) {
      setDynamicThreads([]);
      return;
    }
    const ids = threads.map((t) => t.id);
    // Newest-first so recent previews/search stay accurate even when the total
    // message volume exceeds the row limit.
    const { data: msgs } = await supabase
      .from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .in("thread_id", ids)
      .order("received_at", { ascending: false })
      .limit(1000);

    const nameOf = (t: any) => t.display_name || `+${t.wa_phone}`;
    const mapped: InboxThread[] = threads.map((t: any) => ({
      id: `wa-${t.id}`,
      dbId: t.id,
      name: nameOf(t),
      initials: (nameOf(t).match(/[A-Za-z0-9]/g) || ["W"]).slice(0, 2).join("").toUpperCase(),
      phone: `+${t.wa_phone}`,
      preview: t.last_message || "",
      time: t.last_message_at
        ? new Date(t.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "",
      online: false,
      platform: "whatsapp",
      unreadCount: t.unread_count || 0,
      starred: false,
      lastMessageAt: t.last_message_at || undefined,
      deletedAt: t.deleted_at || null,
    }));
    setDynamicThreads(mapped);

    const byThread = new Map<string, any[]>();
    for (const m of msgs || []) {
      const list = byThread.get(m.thread_id) || [];
      list.push(m);
      byThread.set(m.thread_id, list);
    }
    setChatMessages((prev) => {
      const next = { ...prev };
      for (const t of threads) {
        const key = `wa-${t.id}`;
        // Never downgrade a thread whose full history was fetched individually.
        if (fullyLoadedThreadsRef.current.has(key)) continue;
        const rows = (byThread.get(t.id) || []).slice().reverse();
        next[key] = mapMessageRows(rows);
      }
      return next;
    });

    // Keep the open conversation authoritative on every refresh.
    if (selectedChatIdRef.current?.startsWith("wa-")) {
      const key = selectedChatIdRef.current;
      const { data } = await supabase
        .from("whatsapp_messages")
        .select(MESSAGE_COLUMNS)
        .eq("thread_id", key.slice(3))
        .order("received_at", { ascending: true })
        .limit(1000);
      setChatMessages((prev) => ({ ...prev, [key]: mapMessageRows(data || []) }));
      fullyLoadedThreadsRef.current.add(key);
    }
  };

  useEffect(() => {
    loadWhatsAppInbox();
    const channel = supabase
      .channel("whatsapp-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, () => {
        loadWhatsAppInbox();
        queryClient.invalidateQueries({ queryKey: ["whatsapp-single-send-stats"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-inbox-stats"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-sent-counters"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp-metric-threads"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_threads" }, () => loadWhatsAppInbox())
      // Template review results (approved / rejected / paused) arrive via the
      // whatsapp-webhook function, which writes them into whatsapp_templates.
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_templates" }, (payload: any) => {
        const row = payload?.new;
        if (!row?.name || !row?.status) return;
        const status = String(row.status).toLowerCase();
        setTemplates((prev) =>
          prev.map((t) =>
            t.name === row.name && (!row.language || !t.language || t.language === row.language) ? { ...t, status } : t,
          ),
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync approved templates from Meta on mount so Single Send + Inbox
  // can immediately pick real approved templates instead of local mocks.
  useEffect(() => {
    syncTemplateStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track delivery status of the most recent Single Send via realtime updates
  // to whatsapp_messages, populated by the whatsapp-webhook function.
  useEffect(() => {
    if (!lastSend?.messageId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("status, status_updated_at, error, error_code, error_message")
        .eq("wa_message_id", lastSend.messageId)
        .maybeSingle();
      if (!cancelled && data?.status) {
        setLastSend((prev) =>
          prev && prev.messageId === lastSend.messageId
            ? {
                ...prev,
                status: data.status!,
                statusAt: data.status_updated_at || prev.statusAt,
                error: (data as any).error,
                errorCode: (data as any).error_code ?? null,
                errorMessage: (data as any).error_message ?? null,
              }
            : prev,
        );
      }
    })();
    const channel = supabase
      .channel(`wa-send-${lastSend.messageId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
          filter: `wa_message_id=eq.${lastSend.messageId}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (!row?.status) return;
          console.log("[whatsapp Single Send] delivery status update", {
            messageId: lastSend.messageId,
            status: row.status,
            at: row.status_updated_at,
            error: row.error,
          });
          setLastSend((prev) =>
            prev && prev.messageId === lastSend.messageId
              ? {
                  ...prev,
                  status: row.status,
                  statusAt: row.status_updated_at || new Date().toISOString(),
                  error: row.error,
                  errorCode: row.error_code ?? null,
                  errorMessage: row.error_message ?? null,
                }
              : prev,
          );
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [lastSend?.messageId]);

  // Webhook health: the whatsapp-webhook function stamps last_status_event_at onto
  // the shared connected_apps row every time it processes a Meta status event.
  // If this never advances while sends sit at "accepted", the status pipeline
  // (signature / subscription) is broken — surface that instead of implying progress.
  const { data: waWebhookHealth } = useQuery({
    queryKey: ["whatsapp-webhook-health"],
    queryFn: async () => {
      const { data } = await supabase
        .from("connected_apps")
        .select("metadata")
        .eq("platform", "WhatsApp Business API")
        .maybeSingle();
      return ((data as any)?.metadata ?? null) as Record<string, any> | null;
    },
    refetchInterval: 30000,
  });

  const { data: dbContacts = [] } = useQuery({
    queryKey: ["wa-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone")
        .not("phone", "is", null)
        .limit(500);
      if (error) throw error;
      return (data || [])
        .map((p: any) => ({
          id: p.id as string,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Unnamed patient",
          phone: (p.phone as string) || "",
        }))
        .filter((c) => c.phone)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    },
    staleTime: 60_000,
  });

  const allThreads = [...dynamicThreads].map((t) => ({
    ...t,
    ...(clearedThreadIds.includes(t.id) ? { unreadCount: 0 } : {}),
    ...(manualUnreadThreadIds.includes(t.id) ? { unreadCount: Math.max(1, t.unreadCount || 0) } : {}),
    starred: starredThreadIds.includes(t.id),
  }));

  const inboxDateRange = useMemo(() => {
    const now = new Date();
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const endOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    if (inboxDatePreset === "today") return { from: startOf(now), to: endOf(now) };
    if (inboxDatePreset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOf(y), to: endOf(y) };
    }
    if (inboxDatePreset === "last7") {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { from: startOf(s), to: endOf(now) };
    }
    if (inboxDatePreset === "custom") {
      return {
        from: inboxCustomFrom ? startOf(new Date(inboxCustomFrom)) : undefined,
        to: inboxCustomTo ? endOf(new Date(inboxCustomTo)) : undefined,
      };
    }
    return { from: undefined, to: undefined };
  }, [inboxDatePreset, inboxCustomFrom, inboxCustomTo]);

  const displayThreads = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase();
    const { from, to } = inboxDateRange;
    return allThreads.filter((c) => {
      if (from || to) {
        if (!c.lastMessageAt) return false;
        const ts = new Date(c.lastMessageAt).getTime();
        if (from && ts < from.getTime()) return false;
        if (to && ts > to.getTime()) return false;
      }
      if (!q) return true;
      const base = [c.name, c.phone, c.preview].join(" ").toLowerCase();
      if (base.includes(q)) return true;
      return (chatMessages[c.id] || []).some(
        (m) => (m.text || "").toLowerCase().includes(q) || (m.templateName || "").toLowerCase().includes(q),
      );
    });
  }, [allThreads, inboxSearch, chatMessages, inboxDateRange]);

  const selectedThread = selectedChatId ? allThreads.find((t) => t.id === selectedChatId) : null;

  const normalizePhoneForMeta = (raw: string): string | null => {
    if (!raw || raw.includes("•")) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8) return null;
    if (digits.length === 10) return `91${digits}`;
    if (digits.length >= 11 && digits.length <= 15) return digits;
    return digits;
  };

  const handleSendChat = async () => {
    if (!selectedChatId || sendingDraft) return;
    const isTemplate = sendMode === "template";
    const isMedia = !isTemplate && !!pendingMedia;
    const text = draftMessage.trim();
    if (isTemplate) {
      if (customTemplateMode ? !customTemplateName.trim() : !selectedTemplateName) return;
    } else if (!isMedia && !text) {
      return;
    }

    const phone = allThreads.find((t) => t.id === selectedChatId)?.phone;
    const activeTemplateName = customTemplateMode ? customTemplateName.trim() : selectedTemplateName;
    const activeTemplateBody = !customTemplateMode
      ? approvedTemplates.find((t) => t.name === selectedTemplateName)?.body || ""
      : "";
    const renderTplBody = (tpl: string, params: string[]) =>
      tpl.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
        const v = params[Number(n) - 1];
        return v == null || v === "" ? `{{${n}}}` : String(v);
      });
    const previewParams = [selectedThread?.name || "Customer"];
    const bubbleText = isTemplate
      ? activeTemplateBody
        ? renderTplBody(activeTemplateBody, previewParams)
        : `Sent template: ${activeTemplateName}`
      : text;

    const appendBubble = (failed?: boolean) =>
      setChatMessages((prev) => ({
        ...prev,
        [selectedChatId]: [
          ...(prev[selectedChatId] || []),
          isMedia && pendingMedia
            ? {
                id: crypto.randomUUID(),
                direction: "out" as const,
                text: "",
                time: "now",
                failed,
                mediaUrl: pendingMedia.dataUrl,
                mediaKind: pendingMedia.kind as MediaKind,
                mediaMime: pendingMedia.mime,
                mediaFilename: pendingMedia.name,
                ...(pendingMedia.kind === "image"
                  ? { imageUrl: pendingMedia.dataUrl, imageKind: "image" as const }
                  : {}),
              }
            : { id: crypto.randomUUID(), direction: "out" as const, text: bubbleText, time: "now", failed },
        ],
      }));

    if (!phone) {
      appendBubble(true);
      toast({
        title: "No phone number on this thread",
        description: "Message kept locally only.",
        variant: "destructive",
      });
      return;
    }

    const to = normalizePhoneForMeta(phone);
    if (!to) {
      appendBubble(true);
      toast({
        title: "Invalid phone number for WhatsApp",
        description: "Expected digits with country code.",
        variant: "destructive",
      });
      return;
    }

    setSendingDraft(true);
    try {
      const effectiveTemplateName = customTemplateMode ? customTemplateName.trim() : selectedTemplateName;
      const templateLang = customTemplateMode
        ? customTemplateLang.trim() || "en_US"
        : approvedTemplates.find((t) => t.name === selectedTemplateName)?.language || "en_US";
      const selectedTemplate = approvedTemplates.find((t) => t.name === selectedTemplateName);
      const chatParamCount = !customTemplateMode ? countPlaceholders(selectedTemplate?.body || "") : 0;
      const chatBodyParams =
        chatParamCount > 0
          ? Array.from({ length: chatParamCount }, (_, i) => (i === 0 ? selectedThread?.name || "Customer" : "").trim())
          : [];
      if (chatParamCount > 1 && chatBodyParams.slice(1).some((v) => !v)) {
        toast({
          title: "Template needs more details",
          description: "Use Single Send for templates with multiple BODY parameters.",
          variant: "destructive",
        });
        return;
      }
      // Header media (image/video/document) is auto-attached by the backend
      // from whatsapp_templates.header_media_url. The frontend also passes an
      // explicit header_media_url when a mapped asset exists to satisfy schema validation.
      const headerComponents = isTemplate ? buildHeaderImageComponents(effectiveTemplateName) : [];
      const mappedHeaderUrl = isTemplate ? getMappedHeaderImageUrl(effectiveTemplateName) : "";
      const body = isTemplate
        ? {
            to,
            type: "template",
            templateName: effectiveTemplateName,
            languageCode: templateLang,
            bodyParams: chatBodyParams,
            ...(headerComponents.length ? { components: headerComponents } : {}),
            ...(mappedHeaderUrl ? { header_media_url: mappedHeaderUrl } : {}),
          }
        : isMedia && pendingMedia
          ? {
              to,
              type: pendingMedia.kind, // "image" | "document"
              mediaBase64: pendingMedia.dataUrl.split(",")[1] || "",
              mediaMime: pendingMedia.mime,
              mediaFilename: pendingMedia.name,
              ...(text ? { caption: text } : {}),
            }
          : { to, type: "text", text };

      const { data: sessionData0 } = await supabase.auth.getSession();
      const token0 = sessionData0?.session?.access_token;
      if (!token0) throw new Error("Your session expired. Please sign in again.");
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          ...body,
          // Inbox replies are always a human typing in the WhatsApp screen.
          context: { module: "manual", messageKind: isTemplate ? "inbox_template" : "inbox_reply" },
        },
        headers: { Authorization: `Bearer ${token0}` },

      });
      if (error) {
        console.error("Edge function execution error:", error);
        let detailed = "";
        const ctx = (error as any).context as Response | undefined;
        if (ctx && typeof ctx.clone === "function") {
          try {
            const cloned = ctx.clone();
            const raw = await cloned.text();
            try {
              const parsed = JSON.parse(raw);
              detailed =
                parsed?.error ||
                parsed?.message ||
                parsed?.details?.error?.message ||
                (typeof parsed === "string" ? parsed : "") ||
                raw;
            } catch {
              detailed = raw;
            }
          } catch (readErr) {
            console.error("Failed to read edge function error body:", readErr);
          }
        }
        throw new Error(detailed || error.message || "Edge Function returned an internal status failure.");
      }
      if (data && (data as any).ok === false) {
        const d = data as any;
        throw new Error(d.error || d.details?.error?.message || d.message || "Send failed");
      }
      appendBubble(false);
      if (isTemplate) {
        const sentName = customTemplateMode ? customTemplateName.trim() : selectedTemplateName;
        setSelectedTemplateName("");
        setCustomTemplateName("");

        toast({ title: `Template "${sentName}" sent.` });
      } else {
        setDraftMessage("");
        setPendingMedia(null);
        toast({
          title: isMedia ? "Media sent to WhatsApp." : "Message delivered successfully to WhatsApp.",
          description:
            "Delivered to Meta. If the contact is outside the 24 h window, WhatsApp may not surface it — use a template.",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      const isConnErr = /not connected|access token missing/i.test(msg);
      appendBubble(true);
      toast({
        title: "WhatsApp send failed",
        description: isConnErr ? "Open Settings → Connected Apps and connect WhatsApp Business API." : msg,
        variant: "destructive",
      });
    } finally {
      setSendingDraft(false);
    }
  };

  const handleContinueNewMessage = () => {
    const chosenId = newMessageContact;
    if (!chosenId) return;

    let threadId = chosenId;
    let displayName = "New contact";
    let phone = "";
    let initials = "?";

    if (chosenId.startsWith("manual:")) {
      const raw = chosenId.slice("manual:".length).trim();
      if (!raw) return;
      const normalized = normalizePhoneForMeta(raw);
      if (!normalized) {
        toast({ title: "Enter a valid phone number with country code", variant: "destructive" });
        return;
      }
      threadId = `manual-${normalized}-${Date.now()}`;
      displayName = `+${normalized}`;
      phone = normalized;
      initials = "?";
    } else {
      const patient = dbContacts.find((c) => c.id === chosenId);
      displayName = patient?.name ?? "New contact";
      const rawPhone = patient?.phone ?? "";
      const normalized = normalizePhoneForMeta(rawPhone);
      if (!normalized) {
        toast({
          title: "This contact has no valid WhatsApp number",
          description: "Add a phone number with country code to the contact, or use the manual phone entry.",
          variant: "destructive",
        });
        return;
      }
      phone = normalized;
      initials =
        displayName
          .split(/\s+/)
          .map((w) => w[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "?";
    }

    setDynamicThreads((prev) =>
      prev.some((t) => t.id === threadId)
        ? prev
        : [
            {
              id: threadId,
              name: displayName,
              initials,
              phone,
              preview: "Start a conversation…",
              time: "now",
              online: false,
              platform: "whatsapp" as const,
              unreadCount: 0,
              starred: false,
            },
            ...prev,
          ],
    );
    setChatMessages((prev) => (prev[threadId] ? prev : { ...prev, [threadId]: [] }));
    setSelectedChatId(threadId);
    setNewMessageOpen(false);
    setNewMessageContact("");
    setNewMessageSearch("");
  };

  // Live recipient validation while typing (debounced).
  useEffect(() => {
    const raw = singleSend.recipient.trim();
    if (!raw) {
      setRecipientCheck(null);
      setCheckingRecipient(false);
      return;
    }
    let cancelled = false;
    setCheckingRecipient(true);
    const t = setTimeout(async () => {
      try {
        const result = await checkWhatsAppRecipient(raw);
        if (!cancelled) {
          setRecipientCheck({
            ok: result.ok,
            reason: result.ok
              ? undefined
              : result.code === "blacklisted"
                ? `${NOT_ON_WHATSAPP_MESSAGE} — ${result.reason || "number blacklisted after a previous undeliverable failure."}`
                : result.reason,
          });
        }
      } finally {
        if (!cancelled) setCheckingRecipient(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setCheckingRecipient(false);
    };
  }, [singleSend.recipient]);

  const handleSingleSend = async () => {
    if (!singleSend.recipient.trim()) {
      toast({ title: "Missing info", description: "Recipient is required.", variant: "destructive" });
      return;
    }
    const to = normalizePhoneForMeta(singleSend.recipient);
    if (!to) {
      toast({
        title: "Invalid phone number",
        description: "Enter a valid phone number with country code (e.g. 919876543210).",
        variant: "destructive",
      });
      return;
    }

    // Pre-send WhatsApp number validation — blocks invalid formats and numbers
    // auto-blacklisted after a Meta 131026 (undeliverable) failure.
    const preCheck = await checkWhatsAppRecipient(singleSend.recipient);
    setRecipientCheck({ ok: preCheck.ok, reason: preCheck.reason });
    if (!preCheck.ok) {
      toast({
        title: preCheck.code === "blacklisted" ? NOT_ON_WHATSAPP_MESSAGE : "Invalid WhatsApp number",
        description: preCheck.reason,
        variant: "destructive",
      });
      return;
    }

    // Media send path — bypass template flow when a file is attached.
    if (singleMedia) {
      setSendingSingle(true);
      try {
        const caption = singleSend.message.replace(/\{\{\s*1\s*\}\}/g, singleSend.customerName || "").trim();
        const { data: sessionData1 } = await supabase.auth.getSession();
        const token1 = sessionData1?.session?.access_token;
        if (!token1) throw new Error("Your session expired. Please sign in again.");
        const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
          headers: { Authorization: `Bearer ${token1}` },
          body: {
            to,
            type: singleMedia.kind,
            mediaBase64: singleMedia.dataUrl.split(",")[1] || "",
            mediaMime: singleMedia.mime,
            mediaFilename: singleMedia.name,
            ...(caption ? { caption } : {}),
            source: "single_send",
            context: { module: "manual", messageKind: "single_send_media" },

          },
        });
        if (error) throw new Error((error as any).message || "Send failed");
        if (data && (data as any).ok === false) throw new Error((data as any).error || "Send failed");
        const messageId = (data as any)?.messageId;
        if (messageId)
          setLastSend({
            messageId,
            to,
            status: (data as any)?.status || "accepted",
            statusAt: new Date().toISOString(),
          });
        toast({ title: "Media sent successfully via WhatsApp." });
        setSingleMedia(null);
        setSingleSend({ recipient: "", customerName: "", templateName: "", message: "" });
      } catch (e) {
        toast({
          title: "WhatsApp send failed",
          description: e instanceof Error ? e.message : "Send failed",
          variant: "destructive",
        });
      } finally {
        setSendingSingle(false);
      }
      return;
    }

    if (!singleSend.templateName.trim()) {
      toast({ title: "Missing info", description: "Select a template or attach media.", variant: "destructive" });
      return;
    }
    const template = approvedTemplates.find((t) => t.name === singleSend.templateName);
    if (!template) {
      toast({
        title: "Template unavailable",
        description: "Select an approved template synced from Meta before sending.",
        variant: "destructive",
      });
      return;
    }
    const bodyParamValues = Array.from({ length: singleTemplateParamCount }, (_, i) =>
      (i === 0 ? singleSend.customerName : singleParams[i] || "").trim(),
    );
    if (singleTemplateParamCount > 0) {
      if (!bodyParamValues[0]) {
        toast({
          title: "Enter customer name",
          description: "Customer name is sent as template parameter {{1}}.",
          variant: "destructive",
        });
        return;
      }
      const missing = bodyParamValues.some((v) => !v);
      if (missing) {
        toast({
          title: "Fill all template parameters",
          description: `This template needs ${singleTemplateParamCount} value(s).`,
          variant: "destructive",
        });
        return;
      }
    }
    setSendingSingle(true);
    try {
      // Prefer the template's original approved header media (Meta CDN URL) over
      // any locally mapped preview asset so Meta never receives a redirecting
      // preview-origin URL (root cause of HTTP 302 / error 131053).
      const templateHeaderFormat = String((template as any)?.header_format || "").toUpperCase();
      const templateApprovedHeaderUrl =
        typeof (template as any)?.header_example === "string" && /^https:\/\//i.test((template as any).header_example)
          ? ((template as any).header_example as string)
          : "";
      const mappedFallbackUrl = getMappedHeaderImageUrl(template.name);
      const userOverrideHeaderUrl = singleHeaderMediaUrl.trim();
      const singleMappedHeaderUrl = ["IMAGE", "VIDEO", "DOCUMENT"].includes(templateHeaderFormat)
        ? userOverrideHeaderUrl || templateApprovedHeaderUrl || mappedFallbackUrl
        : "";
      const singleHeaderComponents = singleMappedHeaderUrl
        ? [
            {
              type: "header",
              parameters: [
                {
                  type: templateHeaderFormat.toLowerCase(),
                  [templateHeaderFormat.toLowerCase()]: { link: singleMappedHeaderUrl },
                },
              ],
            },
          ]
        : [];
      const { data: sessionData2 } = await supabase.auth.getSession();
      const token2 = sessionData2?.session?.access_token;
      if (!token2) throw new Error("Your session expired. Please sign in again.");
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        headers: { Authorization: `Bearer ${token2}` },
        body: {
          to,
          type: "template",
          templateName: template.name,
          languageCode: template.language,
          customerName: singleSend.customerName.trim(),
          bodyParams: bodyParamValues,
          source: "single_send",
          context: { module: "manual", messageKind: "single_send_template" },

          // Header media auto-resolved by backend from whatsapp_templates.header_media_url.
          // Frontend also passes an explicit header_media_url when a mapped asset exists
          // to satisfy schema validation and bypass the validation trigger.
          ...(singleHeaderComponents.length ? { components: singleHeaderComponents } : {}),
          ...(singleMappedHeaderUrl ? { header_media_url: singleMappedHeaderUrl } : {}),
        },
      });

      let errMsg: string | null = null;
      if (error) {
        const ctx: any = (error as any).context;
        try {
          const raw = ctx && typeof ctx.clone === "function" ? await ctx.clone().text() : null;
          if (raw) {
            try {
              errMsg = JSON.parse(raw)?.error || raw;
            } catch {
              errMsg = raw;
            }
          }
        } catch {
          /* ignore */
        }
        throw new Error(errMsg || error.message || "Send failed");
      }
      if (data && (data as any).ok === false) throw new Error((data as any).error || "Send failed");
      const messageId = (data as any)?.messageId;
      const status = (data as any)?.status || "accepted";
      if (messageId) {
        setLastSend({ messageId, to, status, statusAt: new Date().toISOString() });
      }
      console.log("[whatsapp Single Send] result", { messageId, status, waResponse: (data as any)?.waResponse });
      toast({
        title: "Message sent successfully through WhatsApp API automation channel.",
        description: messageId ? `Meta message id: ${messageId} · status: ${status}` : undefined,
      });
      setSingleSend({ recipient: "", customerName: "", templateName: "", message: "" });
      setSingleParams([]);
      setSingleHeaderImageUrl("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      const isConnErr = /not connected|access token missing/i.test(msg);
      toast({
        title: "WhatsApp send failed",
        description: isConnErr ? "Open Settings → Connected Apps and connect WhatsApp Business API." : msg,
        variant: "destructive",
      });
    } finally {
      setSendingSingle(false);
    }
  };

  const { data: campaigns = [] } = useQuery({
    queryKey: ["whatsapp-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Date range filter for analytics (default: Today). Purely client-side; drives
  // the sent-counters query below and refetches only on range change or Refresh click.
  const {
    preset: datePreset,
    setPreset: setDatePreset,
    customFrom: dateCustomFrom,
    setCustomFrom: setDateCustomFrom,
    customTo: dateCustomTo,
    setCustomTo: setDateCustomTo,
    range: dateRange,
  } = useDateRangeFilter("today", "whatsapp-api-analytics");

  const rangeFromISO = dateRange.from ? dateRange.from.toISOString() : undefined;
  const rangeToISO = dateRange.to ? dateRange.to.toISOString() : undefined;
  // Drill-down sheet for the "Messages Sent" card (4 levels).
  const [sentDrillOpen, setSentDrillOpen] = useState(false);


  // Live outbound message counters.
  //  - `range`  : the dashboard date filter (informational)
  //  - `today`  : Meta's own quota day, an explicit UTC calendar day. Meta counts
  //               the daily messaging limit in UTC, so this must NOT follow the
  //               dashboard filter (a Week/Month selection used to be compared
  //               against a one-day quota) nor the browser's local day.
  //  - `month`  : current UTC month, for the billing card.
  // No wa_message_id filter here, so these agree with the "Messages Sent" card.
  const { data: sentCounters, refetch: refetchSentCounters } = useQuery({
    queryKey: ["whatsapp-sent-counters", rangeFromISO, rangeToISO],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = new Date();
      const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const startOfUtcMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      // Viewer-local calendar day (midnight to midnight in the clinic's timezone, IST),
      // used only for display so the quota card agrees with the "Messages Sent" card.
      const startOfLocalDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const outbound = () =>
        supabase.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("direction", "out");
      let rangeQuery = outbound();
      if (rangeFromISO) rangeQuery = rangeQuery.gte("created_at", rangeFromISO);
      if (rangeToISO) rangeQuery = rangeQuery.lte("created_at", rangeToISO);
      const [{ count: rangeCount }, { count: todayCount }, { count: monthCount }, { count: todayLocalCount }] =
        await Promise.all([
          rangeQuery,
          outbound().gte("created_at", startOfUtcDay),
          outbound().gte("created_at", startOfUtcMonth),
          outbound().gte("created_at", startOfLocalDay),
        ]);
      return {
        range: rangeCount || 0,
        today: todayCount || 0,
        month: monthCount || 0,
        todayLocal: todayLocalCount || 0,
      };
    },
  });

  // Dashboard stats sourced directly from whatsapp_messages for the selected range.
  // Every value is a real DB count; any failure degrades to 0 instead of NaN/undefined.
  const { data: inboxStats, refetch: refetchInboxStats } = useQuery({
    queryKey: ["whatsapp-inbox-stats", rangeFromISO, rangeToISO],
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const withRange = (q: any) => {
        let x = q;
        if (rangeFromISO) x = x.gte("created_at", rangeFromISO);
        if (rangeToISO) x = x.lte("created_at", rangeToISO);
        return x;
      };
      const base = () => supabase.from("whatsapp_messages").select("id", { count: "exact", head: true });
      const safeCount = async (q: any): Promise<number> => {
        try {
          const { count, error } = await q;
          if (error) {
            console.warn("[wa-stats] count failed", error.message);
            return 0;
          }
          return typeof count === "number" && Number.isFinite(count) ? count : 0;
        } catch (e) {
          console.warn("[wa-stats] count threw", e);
          return 0;
        }
      };
      const [sent, delivered, read, failed, pending, responses] = await Promise.all([
        safeCount(withRange(base().eq("direction", "out"))),
        // A read message was necessarily delivered, so the delivered funnel includes it.
        // ilike (no wildcard) = case-insensitive exact match on the status column.
        safeCount(withRange(base().eq("direction", "out").or("status.ilike.delivered,status.ilike.read"))),
        safeCount(withRange(base().eq("direction", "out").ilike("status", "read"))),
        safeCount(withRange(base().eq("direction", "out").or("status.ilike.failed,status.ilike.undeliverable,status.ilike.undelivered"))),
        // In-flight: Meta accepted the message but no delivery/failure webhook
        // has arrived yet. Without this, Sent never equals Delivered + Failed.
        safeCount(withRange(base().eq("direction", "out").or("status.ilike.sent,status.ilike.accepted,status.is.null"))),
        safeCount(withRange(base().eq("direction", "in"))),
      ]);

      return { sent, delivered, read, failed, pending, responses };
    },
  });

  const {
    data: liveInsights,
    isLoading: liveLoading,
    refetch: refetchLiveInsights,
    isFetching: liveRefreshing,
  } = useQuery<LiveInsightsResponse>({
    queryKey: ["whatsapp-live-insights", user?.id],
    enabled: Boolean(user),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const insightHeaders = await getFunctionAuthHeaders();
        const { data, error } = await supabase.functions.invoke("whatsapp-live-insights", {
          body: {},
          headers: insightHeaders,
        });
        if (error) {
          return {
            live: false,
            connectionVerified: false,
            connectionExists: false,
            error: error.message,
          } as LiveInsightsResponse;
        }
        return (data || {}) as LiveInsightsResponse;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to load WhatsApp insights";
        return {
          live: false,
          connectionVerified: false,
          connectionExists: false,
          error: message,
        } as LiveInsightsResponse;
      }
    },
  });

  const saveConnection = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please login first");
      const payload = {
        user_id: user.id,
        platform: "WhatsApp Business API",
        is_connected: true,
        verified_at: new Date().toISOString(),
        platform_username: apiConfig.provider,
        access_token: apiConfig.accessToken,
        app_credentials: {
          wa_provider: apiConfig.provider,
          wa_api_url: apiConfig.apiUrl,
          wa_api_key: apiConfig.accessToken,
          wa_phone_id: apiConfig.phoneNumberId,
          wa_waba_id: apiConfig.wabaId,
          wa_webhook_token: apiConfig.webhookToken,
        },
      };
      const { error } = await supabase
        .from("connected_apps")
        .upsert(payload as never, { onConflict: "user_id,platform" } as never);
      if (error) throw error;
      const verifyHeaders = await getFunctionAuthHeaders();
      const { data, error: verifyError } = await supabase.functions.invoke("whatsapp-live-insights", {
        body: {},
        headers: verifyHeaders,
      });
      if (verifyError) throw verifyError;
      if (data?.live === false && data?.error) throw new Error(data.error);
      return data as LiveInsightsResponse;
    },
    onSuccess: async () => {
      setConnectOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-live-insights"] });
      toast({ title: "WhatsApp live connection saved" });
    },
    onError: (error: Error) => {
      toast({ title: "WhatsApp connect failed", description: error.message, variant: "destructive" });
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (data: typeof form) => {
      const { error } = await supabase.from("whatsapp_campaigns").insert({
        name: data.name,
        message_template: data.message_template,
        campaign_type: data.campaign_type,
        target_segment: data.target_segment,
        total_recipients: parseInt(data.total_recipients) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-live-insights"] });
      setCampaignOpen(false);
      resetCampaignForm();
      toast({ title: "Campaign draft saved" });
    },
  });

  const totalSent = campaigns.reduce((a: number, c: any) => a + (c.sent_count || 0), 0);
  const totalDelivered = campaigns.reduce((a: number, c: any) => a + (c.delivered_count || 0), 0);
  const totalRead = campaigns.reduce((a: number, c: any) => a + (c.read_count || 0), 0);
  const totalResponses = campaigns.reduce((a: number, c: any) => a + (c.response_count || 0), 0);

  const { data: metricThreadIds } = useQuery({
    queryKey: ["whatsapp-metric-threads", metricFilter, rangeFromISO, rangeToISO],
    enabled: !!metricFilter,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase.from("whatsapp_messages").select("thread_id");
      if (metricFilter === "sent") q = q.eq("direction", "out");
      else if (metricFilter === "delivered") q = q.eq("direction", "out").eq("status", "delivered");
      else if (metricFilter === "read") q = q.eq("direction", "out").eq("status", "read");
      else if (metricFilter === "failed") q = q.eq("direction", "out").in("status", ["failed", "undeliverable"]);
      else if (metricFilter === "pending") q = q.eq("direction", "out").in("status", ["sent", "accepted"]);
      else if (metricFilter === "responses") q = q.eq("direction", "in");
      if (rangeFromISO) q = q.gte("created_at", rangeFromISO);
      if (rangeToISO) q = q.lte("created_at", rangeToISO);
      const { data } = await q;
      return new Set((data || []).map((r: any) => `wa-${r.thread_id}`));
    },
  });

  const { data: metricMessages = [], isFetching: metricDetailLoading } = useQuery({
    queryKey: ["whatsapp-metric-detail", metricDetail, rangeFromISO, rangeToISO, metricDetailAllTime],
    enabled: !!metricDetail,
    staleTime: 15_000,
    queryFn: async () => {
      const run = async (useRange: boolean) => {
        let q = supabase
          .from("whatsapp_messages")
          .select("id, thread_id, text, direction, status, received_at, created_at, payload")
          .order("created_at", { ascending: false })
          .limit(200);
        if (metricDetail === "responses") q = q.eq("direction", "in");
        else if (metricDetail === "sent") q = q.eq("direction", "out");
        else q = q.eq("direction", "out").eq("status", metricDetail as string);
        if (useRange && rangeFromISO) q = q.gte("created_at", rangeFromISO);
        if (useRange && rangeToISO) q = q.lte("created_at", rangeToISO);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as any[];
      };

      let rows = await run(!metricDetailAllTime);
      if (!metricDetailAllTime && rows.length === 0) rows = await run(false);

      const threadIds = Array.from(new Set(rows.map((r) => r.thread_id).filter(Boolean)));
      const nameMap = new Map<string, string>();
      const phoneMap = new Map<string, string>();
      if (threadIds.length) {
        const { data: th } = await supabase
          .from("whatsapp_threads")
          .select("id, wa_phone, display_name")
          .in("id", threadIds as string[]);
        (th || []).forEach((t: any) => {
          nameMap.set(t.id, t.display_name || t.wa_phone);
          if (t.wa_phone) phoneMap.set(t.id, t.wa_phone);
        });
      }

      return rows.map((r) => {
        const p = r.payload || {};
        const phone =
          phoneMap.get(r.thread_id) ||
          (typeof p?.request?.to === "string" ? p.request.to : "") ||
          (p?.response?.contacts?.[0]?.wa_id ?? "") ||
          "";
        const info = extractSentTemplate(p);
        return {
          id: r.id,
          contact: nameMap.get(r.thread_id) || phone || "Unknown contact",
          phone,
          text: String(r.text || "").trim() || (info ? `[template] ${info.name}` : "(no text)"),
          status: r.status || (r.direction === "in" ? "received" : "sent"),
          direction: r.direction,
          at: r.received_at || r.created_at,
          raw: Object.keys(p).length ? JSON.stringify(p, null, 2) : "",
        };
      });
    },
  });

  const { data: failedMessages = [], isFetching: failedLoading } = useQuery({
    queryKey: ["whatsapp-failed-detail", rangeFromISO, rangeToISO, failedAllTime],
    enabled: failedDetailOpen,
    staleTime: 15_000,
    queryFn: async () => {
      const run = async (useRange: boolean) => {
        let q = supabase
          .from("whatsapp_messages")
          .select("id, thread_id, text, received_at, created_at, status, error, payload")
          .eq("direction", "out")
          .in("status", ["failed", "undeliverable"])
          .order("created_at", { ascending: false })
          .limit(200);
        if (useRange && rangeFromISO) q = q.gte("created_at", rangeFromISO);
        if (useRange && rangeToISO) q = q.lte("created_at", rangeToISO);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as any[];
      };

      let rows = await run(!failedAllTime);
      // Fallback: if the dashboard date range yields nothing, show all-time failures
      let usedAllTime = failedAllTime;
      if (!failedAllTime && rows.length === 0) {
        rows = await run(false);
        usedAllTime = true;
      }
      const threadIds = Array.from(new Set(rows.map((r) => r.thread_id).filter(Boolean)));
      const nameMap = new Map<string, string>();
      const phoneMap = new Map<string, string>();
      if (threadIds.length) {
        const { data: th } = await supabase
          .from("whatsapp_threads")
          .select("id, wa_phone, display_name")
          .in("id", threadIds as string[]);
        (th || []).forEach((t: any) => {
          nameMap.set(t.id, t.display_name || t.wa_phone);
          if (t.wa_phone) phoneMap.set(t.id, t.wa_phone);
        });
      }
      const items = rows.map((r) => {
        const p = r.payload || {};
        // `error` may be a jsonb array (Meta status.errors), an object, or a plain string
        const rawErr = r.error;
        const errFromColumn = Array.isArray(rawErr)
          ? rawErr[0]
          : typeof rawErr === "object" && rawErr !== null
            ? rawErr
            : null;
        const errString = typeof rawErr === "string" ? rawErr : null;
        const metaError =
          errFromColumn ||
          (Array.isArray(p?.errors) ? p.errors[0] : null) ||
          (Array.isArray(p?.status?.errors) ? p.status.errors[0] : null) ||
          p?.error ||
          p?.response?.error ||
          null;
        const reason = metaError?.error_data?.details || metaError?.title || metaError?.message || errString || null;
        const phone = phoneMap.get(r.thread_id) || p?.request?.to || p?.response?.contacts?.[0]?.wa_id || null;
        const name = nameMap.get(r.thread_id);
        const code = metaError?.code != null ? String(metaError.code) : null;
        const info = getMetaErrorInfo(code, reason || undefined);
        return {
          id: r.id,
          contact: name && name !== phone ? `${name}${phone ? ` · ${phone}` : ""}` : phone || "Unknown",
          text: r.text || p?.request?.template?.name || "(no text)",
          at: r.created_at || r.received_at,
          status: r.status as string,
          code,
          reason: reason ? getFriendlyError(reason) : "No error detail recorded by Meta",
          meaning: info.meaning,
          troubleshoot: info.troubleshoot,
          raw: metaError ? JSON.stringify(metaError, null, 2) : rawErr ? JSON.stringify(rawErr, null, 2) : null,
        };
      });
      return Object.assign(items, { usedAllTime });
    },
  });

  // Single Send-only stats. Manual sends carry payload.request.source = 'single_send';
  // older/direct sends have no source at all, so both are counted here (workflow sends excluded).
  const { data: singleSendStats } = useQuery({
    queryKey: ["whatsapp-single-send-stats", rangeFromISO, rangeToISO],
    enabled: activeTab === "single-send",
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const withRange = (q: any) => {
        let x = q
          .eq("direction", "out")
          .or("payload->request->>source.eq.single_send,payload->request->>source.is.null");
        if (rangeFromISO) x = x.gte("created_at", rangeFromISO);
        if (rangeToISO) x = x.lte("created_at", rangeToISO);
        return x;
      };
      const base = () =>
        supabase.from("whatsapp_messages").select("id, thread_id, wa_message_id", { count: "exact", head: false });
      const safe = async (q: any): Promise<{ count: number; rows: any[] }> => {
        try {
          const { count, data, error } = await q;
          if (error) {
            console.warn("[wa-single-send-stats] count failed", error.message);
            return { count: 0, rows: [] };
          }
          return { count: typeof count === "number" && Number.isFinite(count) ? count : 0, rows: data || [] };
        } catch (e) {
          console.warn("[wa-single-send-stats] count threw", e);
          return { count: 0, rows: [] };
        }
      };
      // Status variants cover any casing that may exist in the status column.
      const variants = (s: string) => [s, s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1)];
      const deliveredStatuses = [...variants("delivered"), ...variants("read")];
      const readStatuses = variants("read");
      const failedStatuses = [...variants("failed"), ...variants("undeliverable"), ...variants("undelivered")];
      const pendingStatuses = [...variants("sent"), ...variants("accepted")];
      const [sentRes, deliveredRes, readRes, failedRes, pendingRes] = await Promise.all([
        safe(withRange(base())),
        safe(withRange(base()).in("status", deliveredStatuses)),
        safe(withRange(base()).in("status", readStatuses)),
        safe(withRange(base()).in("status", failedStatuses)),
        safe(withRange(base()).in("status", pendingStatuses)),
      ]);

      // Responses = inbound messages on threads that received a single-send outbound in range.
      const threadIds = Array.from(new Set(sentRes.rows.map((r: any) => r.thread_id).filter(Boolean)));
      let responses = 0;
      if (threadIds.length) {
        let rq = supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "in")
          .in("thread_id", threadIds as string[]);
        if (rangeFromISO) rq = rq.gte("created_at", rangeFromISO);
        if (rangeToISO) rq = rq.lte("created_at", rangeToISO);
        const rRes = await safe(rq);
        responses = rRes.count;
      }
      return {
        sent: sentRes.count,
        delivered: deliveredRes.count,
        read: readRes.count,
        failed: failedRes.count,
        pending: pendingRes.count,
        responses,
      };
    },
  });

  // Message list under the Single Send tab, filtered by the metric card the user clicked.
  const { data: singleSendMessages = [], isFetching: singleSendListLoading } = useQuery({
    queryKey: ["whatsapp-single-send-list", rangeFromISO, rangeToISO, metricFilter],
    enabled: activeTab === "single-send",
    staleTime: 15_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q: any = supabase
        .from("whatsapp_messages")
        .select("id, direction, text, status, error, payload, created_at, received_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (metricFilter === "responses") {
        q = q.eq("direction", "in");
      } else {
        q = q
          .eq("direction", "out")
          .or("payload->request->>source.eq.single_send,payload->request->>source.is.null");
        if (metricFilter === "delivered") q = q.in("status", ["delivered", "read"]);
        else if (metricFilter === "read") q = q.eq("status", "read");
        else if (metricFilter === "failed") q = q.in("status", ["failed", "undeliverable"]);
        else if (metricFilter === "pending") q = q.in("status", ["sent", "accepted"]);
      }
      if (rangeFromISO) q = q.gte("created_at", rangeFromISO);
      if (rangeToISO) q = q.lte("created_at", rangeToISO);
      const { data, error } = await q;
      if (error) {
        console.warn("[wa-single-send-list] failed", error.message);
        return [];
      }
      return (data || []).map((r: any) => {
        const errArr = Array.isArray(r.error) ? r.error : r.error ? [r.error] : [];
        const first = errArr[0] || {};
        return {
          id: r.id as string,
          direction: r.direction as string,
          phone: r.payload?.request?.to || r.payload?.from || "—",
          template: r.payload?.request?.template?.name || (r.direction === "in" ? "Inbound" : "Text"),
          text: (r.text as string) || "",
          status: (r.status as string) || (r.direction === "in" ? "received" : "pending"),
          at: r.created_at || r.received_at,
          errorCode: first?.code ?? null,
          errorTitle: first?.title || first?.message || null,
        };
      });
    },
  });



  // Same category breakdown the Analytics tab shows, shared across Inbox / Single Send.
  const { counts: breakdownCounts, failureReasons } = useMetricCategoryCounts({
    fromISO: rangeFromISO,
    toISO: rangeToISO,
    scope: activeTab === "single-send" ? "single_send" : "all",
  });

  const headerStats = useMemo(() => {
    const source = activeTab === "single-send" ? singleSendStats : inboxStats;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return [
      { key: "sent" as const, label: "Messages Sent", value: num(source?.sent), icon: Send, tone: "text-primary" },
      {
        key: "delivered" as const,
        label: "Delivered",
        value: num(source?.delivered),
        icon: MessageSquare,
        tone: "text-success",
      },
      { key: "read" as const, label: "Read", value: num(source?.read), icon: Eye, tone: "text-primary" },
      {
        key: "failed" as const,
        label: "Failed",
        value: num(source?.failed),
        icon: AlertCircle,
        tone: "text-destructive",
      },
      {
        key: "pending" as const,
        label: "Pending",
        value: num((source as any)?.pending),
        icon: Clock,
        tone: "text-muted-foreground",
      },
      {
        key: "responses" as const,
        label: "Responses",
        value: num(source?.responses),
        icon: TrendingUp,
        tone: "text-primary",
      },
    ];
  }, [activeTab, inboxStats, singleSendStats]);

  const templateStatusColors: Record<string, string> = {
    approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    rejected: "bg-red-500/15 text-red-700 border-red-500/30",
  };

  const campaignStatusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-secondary text-foreground",
    sent: "bg-secondary text-foreground",
    active: "bg-primary/10 text-primary",
  };

  const liveConnected = Boolean(liveInsights?.connectionVerified);
  const accountHealth = liveInsights?.accountHealth;
  const analytics30d = liveInsights?.analytics30d;
  const pricing = liveInsights?.pricing;
  // Billing shows real numbers only when Meta returns verified pricing data.
  const billingAvailable = pricing?.available === true && (pricing?.breakdown || []).length > 0;
  const messageThreads = liveInsights?.messageThreads || [];
  const businessProfile = liveInsights?.businessProfile;

  const refreshLive = async () => {
    const [res] = await Promise.all([refetchLiveInsights(), refetchSentCounters(), refetchInboxStats()]);
    if (res.error) {
      toast({ title: "Refresh failed", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: "WhatsApp status refreshed" });
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <MessageSquare className="text-primary" size={22} />
            WhatsApp Business API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live connection status, campaign performance and business health.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Link size={14} />
                {liveConnected ? "Connected" : "Connect WhatsApp"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
              <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
                <DialogTitle className="font-display">Connect WhatsApp Business API</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div className="rounded-lg border bg-secondary/40 p-4 text-xs text-muted-foreground space-y-1">
                  <p>Save the exact live credentials from your provider.</p>
                  <p>For Meta Cloud API use Phone Number ID, WABA ID and permanent access token.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Input
                    value={apiConfig.provider}
                    onChange={(e) => setApiConfig((c) => ({ ...c, provider: e.target.value }))}
                    placeholder="Meta Cloud API / Wati / Gupshup"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>API Base URL</Label>
                  <Input
                    value={apiConfig.apiUrl}
                    onChange={(e) => setApiConfig((c) => ({ ...c, apiUrl: e.target.value }))}
                    placeholder="https://graph.facebook.com/v22.0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone Number ID</Label>
                  <Input
                    value={apiConfig.phoneNumberId}
                    onChange={(e) => setApiConfig((c) => ({ ...c, phoneNumberId: e.target.value }))}
                    placeholder="123456789012345"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>WABA ID</Label>
                  <Input
                    value={apiConfig.wabaId}
                    onChange={(e) => setApiConfig((c) => ({ ...c, wabaId: e.target.value }))}
                    placeholder="987654321098765"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Permanent Access Token</Label>
                  <Input
                    type="password"
                    value={apiConfig.accessToken}
                    onChange={(e) => setApiConfig((c) => ({ ...c, accessToken: e.target.value }))}
                    placeholder="EAAxxxx"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Webhook Verify Token</Label>
                  <Input
                    value={apiConfig.webhookToken}
                    onChange={(e) => setApiConfig((c) => ({ ...c, webhookToken: e.target.value }))}
                    placeholder="Optional for webhook setup"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t bg-background shrink-0">
                <Button
                  className="w-full"
                  onClick={() => saveConnection.mutate()}
                  disabled={
                    !apiConfig.provider ||
                    !apiConfig.phoneNumberId ||
                    !apiConfig.wabaId ||
                    !apiConfig.accessToken ||
                    saveConnection.isPending
                  }
                >
                  {saveConnection.isPending ? "Verifying live connection..." : "Save & Verify Live"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <SmartDateFilter
            preset={datePreset}
            onPresetChange={setDatePreset}
            customFrom={dateCustomFrom}
            customTo={dateCustomTo}
            onCustomFromChange={setDateCustomFrom}
            onCustomToChange={setDateCustomTo}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={refreshLive}
            disabled={liveRefreshing || liveLoading}
          >
            <RefreshCw size={14} className={liveRefreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {headerStats.map((s) =>
          // "Messages Sent" opens the 4-level drill-down instead of the summary popover.
          s.key === "sent" ? (
            <Card
              key={s.label}
              role="button"
              tabIndex={0}
              title="Messages Sent · open full drill-down"
              onClick={() => setSentDrillOpen(true)}
              className="shadow-card cursor-pointer transition-all hover:bg-secondary/40 hover:shadow-lg hover:-translate-y-0.5"
            >
              <CardContent className="p-4">
                <s.icon size={16} className={`${s.tone} mb-2`} />
                <p
                  className="text-2xl font-bold font-display tabular-nums truncate leading-tight"
                  title={formatCount(s.value)}
                >
                  {formatCount(s.value)}
                </p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ) : (
            <Popover key={s.label}>
              <PopoverTrigger asChild>
                <Card
                  role="button"
                  tabIndex={0}
                  title={`${s.label} · category breakdown`}
                  className="shadow-card cursor-pointer transition-all hover:bg-secondary/40 hover:shadow-lg hover:-translate-y-0.5"
                >
                  <CardContent className="p-4">
                    <s.icon size={16} className={`${s.tone} mb-2`} />
                    <p
                      className="text-2xl font-bold font-display tabular-nums truncate leading-tight"
                      title={formatCount(s.value)}
                    >
                      {formatCount(s.value)}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              </PopoverTrigger>
              {s.key === "failed" ? (
                <FailedBreakdownPopoverContent reasons={failureReasons} total={s.value} />
              ) : (
                <MetricBreakdownPopoverContent
                  label={s.label}
                  counts={breakdownCounts[s.key] || {}}
                  total={s.value}
                />
              )}
            </Popover>
          ),
        )}
      </div>

      <WhatsAppSentDrillDown
        open={sentDrillOpen}
        onOpenChange={setSentDrillOpen}
        fromISO={rangeFromISO}
        toISO={rangeToISO}
        windowLabel={datePreset === "today" ? "Today" : undefined}
        cardTotal={headerStats.find((s) => s.key === "sent")?.value}
        dailyLimit={Number(accountHealth?.dailyLimit) || 0}
        singleDay={datePreset === "today" || datePreset === "yesterday"}
      />



      <Dialog open={failedDetailOpen} onOpenChange={setFailedDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle size={16} className="text-destructive" /> Failed Messages
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap border-b pb-2">
            <p className="text-xs text-muted-foreground">
              {failedAllTime || (failedMessages as any).usedAllTime
                ? "Showing all failed messages (all time)"
                : "Showing failed messages in the selected dashboard date range"}
              {" · "}
              {failedMessages.length} shown{failedMessages.length >= 200 ? " (latest 200)" : ""}
            </p>
            <Button
              type="button"
              variant={failedAllTime ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFailedAllTime((v) => !v)}
            >
              {failedAllTime ? "Use dashboard date range" : "Show all time"}
            </Button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto space-y-2">
            {failedLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading failed messages…</p>
            ) : failedMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No failed messages found</p>
            ) : (
              failedMessages.map((m: any) => (
                <div key={m.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{m.contact}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {m.at ? new Date(m.at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{m.text}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="destructive" className="text-[10px]">
                      {labelize(m.status)}
                    </Badge>
                    {m.code && (
                      <Badge variant="outline" className="text-[10px]">
                        Code {m.code}
                      </Badge>
                    )}
                    <span className="text-xs text-destructive">{m.reason}</span>
                  </div>
                  <div className="rounded-md bg-destructive/5 border border-destructive/10 p-2 space-y-1">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                      <AlertCircle size={12} />
                      {m.meaning || "Meta API Error"}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      <span className="font-medium text-foreground">Troubleshoot:</span>{" "}
                      {m.troubleshoot || "Please check the webhook payload for details."}
                    </p>
                  </div>
                  {m.raw && (
                    <details className="pt-1">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer">Meta payload</summary>
                      <pre className="mt-1 text-[10px] bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {m.raw}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!metricDetail}
        onOpenChange={(o) => {
          if (!o) setMetricDetail(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {metricDetail === "sent"
                ? "Messages Sent"
                : metricDetail === "delivered"
                  ? "Delivered Messages"
                  : metricDetail === "read"
                    ? "Read Messages"
                    : "Responses Received"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap border-b pb-2">
            <p className="text-xs text-muted-foreground">
              {metricDetailAllTime ? "Showing all time" : "Showing the selected dashboard date range"}
              {" · "}
              {metricMessages.length} shown{metricMessages.length >= 200 ? " (latest 200)" : ""}
            </p>
            <Button
              type="button"
              variant={metricDetailAllTime ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMetricDetailAllTime((v) => !v)}
            >
              {metricDetailAllTime ? "Use dashboard date range" : "Show all time"}
            </Button>
          </div>
          <div className="max-h-[65vh] overflow-y-auto space-y-2">
            {metricDetailLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading messages…</p>
            ) : metricMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No messages found</p>
            ) : (
              metricMessages.map((m: any) => (
                <div key={m.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{m.contact}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {m.at ? new Date(m.at).toLocaleString() : "—"}
                    </span>
                  </div>
                  {m.phone && <p className="text-[11px] text-muted-foreground">{m.phone}</p>}
                  <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{m.text}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {labelize(m.status)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {m.direction === "in" ? "Incoming" : "Outgoing"}
                    </Badge>
                  </div>
                  {m.raw && (
                    <details className="pt-1">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer">Status payload</summary>
                      <pre className="mt-1 text-[10px] bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
                        {m.raw}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            {(!allowedTabs || allowedTabs.has("account")) && (
              <TabsTrigger value="account">Account & Health</TabsTrigger>
            )}
            {(!allowedTabs || allowedTabs.has("inbox")) && <TabsTrigger value="inbox">Inbox</TabsTrigger>}
            {(!allowedTabs || allowedTabs.has("campaigns")) && <TabsTrigger value="campaigns">Campaigns</TabsTrigger>}
            {(!allowedTabs || allowedTabs.has("single-send")) && (
              <TabsTrigger value="single-send">Single Send</TabsTrigger>
            )}
            {(!allowedTabs || allowedTabs.has("templates")) && <TabsTrigger value="templates">Templates</TabsTrigger>}
            {(!allowedTabs || allowedTabs.has("bot")) && <TabsTrigger value="bot">Bot / Auto-Reply</TabsTrigger>}
            {(!allowedTabs || allowedTabs.has("analytics")) && <TabsTrigger value="analytics">Analytics</TabsTrigger>}
            {(!allowedTabs || allowedTabs.has("billing")) && (
              <TabsTrigger value="billing">Billing & Pricing</TabsTrigger>
            )}
            {(!allowedTabs || allowedTabs.has("diagnostic")) && (
              <TabsTrigger value="diagnostic">Diagnostic Test</TabsTrigger>
            )}
          </TabsList>
          <div className="flex gap-2">
            {activeTab === "campaigns" && (
              <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus size={14} /> New Campaign
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">Create WhatsApp Campaign</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="space-y-1.5">
                      <Label>Campaign Name</Label>
                      <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Segment</Label>
                        <Select value={segmentKind} onValueChange={(v) => setSegmentKind(v as SegmentKind)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select audience" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="patients_all">{segmentLabel("patients_all")}</SelectItem>
                            <SelectItem value="leads_all">{segmentLabel("leads_all")}</SelectItem>
                            <SelectItem value="treatment">{segmentLabel("treatment")}</SelectItem>
                            <SelectItem value="patients_inactive_6m">{segmentLabel("patients_inactive_6m")}</SelectItem>
                            {customAudience && (
                              <SelectItem value="custom">{segmentLabel("custom", undefined, customAudience.label)}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Recipients</Label>
                        <Input
                          readOnly
                          className="bg-muted/50 tabular-nums"
                          value={
                            audienceLoading
                              ? "Calculating…"
                              : audience
                                ? audience.contacts.length.toLocaleString()
                                : "0"
                          }
                        />
                      </div>
                    </div>
                    {segmentKind === "treatment" && (
                      <div className="space-y-1.5">
                        <Label>Treatment</Label>
                        <Select value={segmentTreatment} onValueChange={setSegmentTreatment}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose treatment" />
                          </SelectTrigger>
                          <SelectContent>
                            {treatmentNames.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {audienceError && <p className="text-xs text-destructive">{audienceError}</p>}
                    {audience && !audienceLoading && (
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">{audienceBreakdownText(audience)}</p>
                        {audience.contacts.length > DAILY_SEND_LIMIT && (
                          <p className="text-[11px] text-warning">
                            {audience.contacts.length.toLocaleString()} contacts exceed today's{" "}
                            {DAILY_SEND_LIMIT.toLocaleString()}-message limit; sending will need more than one day.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Select Approved Template</Label>
                      <Select
                        value={campaignTemplateName}
                        onValueChange={(v) => {
                          setCampaignTemplateName(v);
                          const t = approvedTemplates.find((mt) => mt.name === v);
                          if (t) setForm((f) => ({ ...f, message_template: t.body }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose template" />
                        </SelectTrigger>
                        <SelectContent>
                          {approvedTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.name}>
                              {t.name} ({t.category})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Broadcasts must use an approved template — free text is rejected by Meta.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Message Preview</Label>
                      <Textarea rows={3} readOnly className="bg-muted/50" value={form.message_template} />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => createCampaign.mutate(form)}
                      disabled={
                        !form.name ||
                        !campaignTemplateName ||
                        !audience ||
                        audienceLoading ||
                        audience.contacts.length === 0 ||
                        createCampaign.isPending
                      }
                    >
                      {createCampaign.isPending ? "Saving…" : "Save Campaign Draft"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      Saved as a draft with its audience — no messages are sent yet.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {activeTab === "templates" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={syncTemplateStatuses}
                  disabled={syncingTemplates}
                >
                  <RefreshCw size={14} className={syncingTemplates ? "animate-spin" : ""} /> Sync Status
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Re-submitting appointment template…",
                        description: "Deleting old version and pushing the new spec to Meta.",
                      });
                      const { data, error } = await supabase.functions.invoke("whatsapp-upsert-appointment-template", {
                        body: {},
                      });
                      if (error) throw new Error(error.message);
                      const res = data as {
                        ok?: boolean;
                        error?: string;
                        status?: string;
                        id?: string;
                        note?: string;
                      } | null;
                      if (!res?.ok) throw new Error(res?.error || "Meta rejected the update");
                      toast({
                        title: `Template re-submitted ✓ (${res.status || "PENDING"})`,
                        description: res.note || "Click Sync Status in a minute to refresh.",
                      });
                      setTimeout(() => syncTemplateStatuses(), 4000);
                    } catch (err: any) {
                      toast({
                        title: "Update failed",
                        description: err?.message || "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <RefreshCw size={14} /> Update Appointment Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Submitting invoice template…",
                        description: "Creating invoice_sharing on Meta.",
                      });
                      const { data, error } = await supabase.functions.invoke("whatsapp-upsert-invoice-template", {
                        body: {},
                      });
                      if (error) throw new Error(error.message);
                      const res = data as {
                        ok?: boolean;
                        error?: string;
                        status?: string;
                        id?: string;
                        note?: string;
                      } | null;
                      if (!res?.ok) throw new Error(res?.error || "Meta rejected the create");
                      toast({
                        title: `Invoice template submitted ✓ (${res.status || "PENDING"})`,
                        description: res.note || "Click Sync Status in a minute to refresh.",
                      });
                      setTimeout(() => syncTemplateStatuses(), 4000);
                    } catch (err: any) {
                      toast({
                        title: "Create failed",
                        description: err?.message || "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <RefreshCw size={14} /> Create Invoice Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    try {
                      toast({
                        title: "Submitting prescription template…",
                        description: "Creating payment_sharing on Meta.",
                      });
                      const { data, error } = await supabase.functions.invoke("whatsapp-upsert-prescription-template", {
                        body: {},
                      });
                      if (error) throw new Error(error.message);
                      const res = data as {
                        ok?: boolean;
                        error?: string;
                        status?: string;
                        id?: string;
                        note?: string;
                      } | null;
                      if (!res?.ok) throw new Error(res?.error || "Meta rejected the create");
                      toast({
                        title: `Prescription template submitted ✓ (${res.status || "PENDING"})`,
                        description: res.note || "Click Sync Status in a minute to refresh.",
                      });
                      setTimeout(() => syncTemplateStatuses(), 4000);
                    } catch (err: any) {
                      toast({
                        title: "Create failed",
                        description: err?.message || "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <RefreshCw size={14} /> Create Prescription Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setTemplateForm({
                      name: "appointment_booking_confirmation",
                      category: "utility",
                      language: "en_US",
                      body: "Hello {{1}},\n\nYour appointment at {{2}} is confirmed.\n\nDate: {{3}}\nTime: {{4}}\nTreatment: {{5}}\n\nPlease arrive 10 minutes early. Reply to this message if you need to reschedule.\n\nThank you.",
                      bodyExamples: ["Rahul", "Dr Neemz Dentistry", "12 Jul 2026", "10:30 AM", "Root Canal"],
                    });
                    setTemplateOpen(true);
                  }}
                >
                  <FileText size={14} /> Use Appointment Preset
                </Button>
                <Button size="sm" className="gap-1" onClick={() => setTemplateOpen(true)}>
                  <Plus size={14} /> New Template
                </Button>
                <CreateTemplateDialog
                  open={templateOpen}
                  onOpenChange={setTemplateOpen}
                  form={templateForm}
                  setForm={(updater) => setTemplateForm(updater as any)}
                  onSubmit={async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke("whatsapp-create-template", {
                        body: {
                          name: templateForm.name,
                          category: templateForm.category.toUpperCase(),
                          language: templateForm.language,
                          body: templateForm.body,
                          bodyExamples: templateForm.bodyExamples,
                        },
                      });
                      if (error) throw new Error(error.message);
                      const res = data as { ok?: boolean; error?: string; status?: string; id?: string } | null;
                      if (!res?.ok) throw new Error(res?.error || "Meta rejected template");
                      setTemplateOpen(false);
                      toast({
                        title: `Template submitted ✓ (${res.status || "PENDING"})`,
                        description: `Meta ID: ${res.id || "—"}. Click "Sync Status" in ~30s to refresh.`,
                      });
                      setTimeout(() => syncTemplateStatuses(), 3000);
                    } catch (err: any) {
                      toast({
                        title: "Template submission failed",
                        description: err?.message || "Unknown error",
                        variant: "destructive",
                      });
                    }
                  }}
                />
              </div>
            )}
            {activeTab === "bot" && (
              <Dialog open={botOpen} onOpenChange={setBotOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus size={14} /> New Rule
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display">Add Bot Rule</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="space-y-1.5">
                      <Label>Trigger Keywords (use | for OR)</Label>
                      <Input
                        value={botForm.trigger}
                        onChange={(e) => setBotForm((f) => ({ ...f, trigger: e.target.value }))}
                        placeholder="e.g. hello|hi|hey"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Auto-Reply Message</Label>
                      <Textarea
                        rows={4}
                        value={botForm.response}
                        onChange={(e) => setBotForm((f) => ({ ...f, response: e.target.value }))}
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setBotOpen(false);
                        toast({ title: "Bot rule added" });
                      }}
                    >
                      Save Rule
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <TabsContent value="inbox">
          <div className="mb-3 flex justify-end items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5 relative">
                  <SlidersHorizontal size={14} />
                  Filter
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-0.5">
                    {
                      [
                        inboxFilters.channels.length > 0,
                        !!inboxFilters.assignedTo,
                        !!inboxFilters.direction,
                        !!inboxFilters.outboundType,
                      ].filter(Boolean).length
                    }
                  </Badge>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[360px] p-0">
                <div className="p-3 border-b flex items-center gap-2">
                  <SlidersHorizontal size={14} className="text-primary" />
                  <p className="text-sm font-semibold">Filter</p>
                </div>
                <div className="p-3 space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Channels
                    </p>
                    <div className="flex items-center gap-2">
                      {[
                        { key: "email", icon: Mail, label: "Email", color: "text-blue-500" },
                        {
                          key: "wa_personal",
                          icon: MessageCircle,
                          label: "Personal WhatsApp",
                          color: "text-emerald-500",
                        },
                        {
                          key: "wa_business",
                          icon: MessageSquare,
                          label: "WhatsApp Business",
                          color: "text-green-600",
                          dot: true,
                        },
                        { key: "instagram", icon: Instagram, label: "Instagram", color: "text-pink-500" },
                        { key: "bot", icon: Bot, label: "Bot / Automations", color: "text-violet-500" },
                      ].map((ch) => {
                        const active = inboxFilters.channels.includes(ch.key);
                        return (
                          <button
                            key={ch.key}
                            type="button"
                            title={ch.label}
                            onClick={() =>
                              setInboxFilters((prev) => ({
                                ...prev,
                                channels: active
                                  ? prev.channels.filter((c) => c !== ch.key)
                                  : [...prev.channels, ch.key],
                              }))
                            }
                            className={`relative h-10 w-10 rounded-md border flex items-center justify-center transition ${
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background hover:bg-secondary/50"
                            }`}
                          >
                            <ch.icon size={18} className={ch.color} />
                            {ch.dot && (
                              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Assigned to Staff
                    </p>
                    <Select
                      value={inboxFilters.assignedTo}
                      onValueChange={(v) => setInboxFilters((p) => ({ ...p, assignedTo: v }))}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select staff member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="me">Assigned to me</SelectItem>
                        <SelectItem value="team">My team</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Last Message Direction
                    </p>
                    <ToggleGroup
                      type="single"
                      value={inboxFilters.direction}
                      onValueChange={(v) => setInboxFilters((p) => ({ ...p, direction: v }))}
                      className="justify-start gap-2"
                    >
                      <ToggleGroupItem
                        value="inbound"
                        className="border rounded-md px-4 h-9 data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-primary"
                      >
                        Inbound
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="outbound"
                        className="border rounded-md px-4 h-9 data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-primary"
                      >
                        Outbound
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Last Outbound Message
                    </p>
                    <ToggleGroup
                      type="single"
                      value={inboxFilters.outboundType}
                      onValueChange={(v) => setInboxFilters((p) => ({ ...p, outboundType: v }))}
                      className="justify-start gap-2"
                    >
                      <ToggleGroupItem
                        value="manual"
                        className="border rounded-md px-4 h-9 data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-primary"
                      >
                        Manual
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="workflow"
                        className="border rounded-md px-4 h-9 data-[state=on]:bg-primary/10 data-[state=on]:border-primary data-[state=on]:text-primary"
                      >
                        Workflow
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                </div>
                <div className="p-3 border-t flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setInboxFilters({ channels: [], assignedTo: "", direction: "", outboundType: "" })}
                  >
                    CLEAR
                  </Button>
                  <Button size="sm" variant="outline" className="border-primary text-primary hover:bg-primary/10">
                    APPLY
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button size="sm" onClick={() => setNewMessageOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              Create new message
            </Button>
          </div>

          <Card className="shadow-card overflow-hidden">
            <div className="flex h-[560px]">
              <div className="w-80 border-r flex flex-col">
                <div className="p-3 border-b space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8 h-9"
                      placeholder="Search conversations..."
                      value={inboxSearch}
                      onChange={(e) => setInboxSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={inboxDatePreset} onValueChange={(v) => setInboxDatePreset(v as any)}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <CalendarDays className="h-3.5 w-3.5 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All dates</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="yesterday">Yesterday</SelectItem>
                        <SelectItem value="last7">Last 7 Days</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {inboxDatePreset === "custom" && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={inboxCustomFrom}
                        onChange={(e) => setInboxCustomFrom(e.target.value)}
                        className="h-8 text-xs px-2"
                      />
                      <span className="text-[10px] text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={inboxCustomTo}
                        onChange={(e) => setInboxCustomTo(e.target.value)}
                        className="h-8 text-xs px-2"
                      />
                    </div>
                  )}
                  {metricFilter && (
                    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">
                      <span>
                        Filter:{" "}
                        {
                          (
                            {
                              sent: "Messages Sent",
                              delivered: "Delivered",
                              read: "Read",
                              failed: "Failed",
                              pending: "Pending",
                              responses: "Responses",
                            } as const
                          )[metricFilter]
                        }
                      </span>
                      <div className="flex items-center gap-2">
                        {metricFilter === "failed" && (
                          <button
                            type="button"
                            onClick={() => setFailedDetailOpen(true)}
                            className="hover:underline font-medium"
                          >
                            Errors
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setMetricFilter(null)}
                          className="hover:underline font-medium"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 px-2 py-2 border-b overflow-x-auto">
                  {(
                    [
                      {
                        key: "starred",
                        label: "Starred",
                        badge: (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {
                              displayThreads.filter(
                                (t) => t.starred && !archivedThreadIds.includes(t.id) && !t.deletedAt,
                              ).length
                            }
                          </Badge>
                        ),
                      },
                      {
                        key: "all",
                        label: "All",
                        badge: (
                          <span className="text-[10px] text-muted-foreground">
                            {(() => {
                              const loaded = displayThreads.filter(
                                (t) => !archivedThreadIds.includes(t.id) && !t.deletedAt,
                              ).length;
                              return inboxTotalCount !== null && inboxTotalCount > loaded
                                ? `${loaded} of ${inboxTotalCount}`
                                : loaded;
                            })()}
                          </span>
                        ),
                      },
                      {
                        key: "unread",
                        label: "Unread",
                        badge: (() => {
                          const n = displayThreads
                            .filter((t) => !archivedThreadIds.includes(t.id) && !t.deletedAt)
                            .reduce((s, t) => s + (t.unreadCount || 0), 0);
                          return (
                            <span className="min-w-[20px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                              {n}
                            </span>
                          );
                        })(),
                      },
                      {
                        key: "archived",
                        label: "Archived",
                        badge: (
                          <span className="text-[10px] text-muted-foreground">
                            {displayThreads.filter((t) => archivedThreadIds.includes(t.id) && !t.deletedAt).length}
                          </span>
                        ),
                      },
                      {
                        key: "trash",
                        label: "Trash",
                        badge: (
                          <span className="text-[10px] text-muted-foreground">
                            {displayThreads.filter((t) => !!t.deletedAt).length}
                          </span>
                        ),
                      },
                      {
                        key: "wa_groups",
                        label: "WA Groups",
                        badge: (
                          <span className="bg-primary/15 text-primary text-[9px] font-semibold px-1.5 py-[1px] rounded uppercase">
                            Beta
                          </span>
                        ),
                      },
                    ] as const
                  ).map((tab) => {
                    const active = activeInboxFilter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveInboxFilter(tab.key)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors shrink-0 ${active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary"}`}
                      >
                        {tab.key === "starred" && <Star size={12} className={active ? "fill-primary" : ""} />}
                        {tab.key === "archived" && <Archive size={12} />}
                        {tab.key === "trash" && <Trash2 size={12} />}
                        {tab.label}
                        {tab.badge}
                      </button>
                    );
                  })}
                </div>
                <div className="flex-1 overflow-y-auto divide-y">
                  {activeInboxFilter === "wa_groups" ? (
                    <div className="p-6 text-center text-xs text-muted-foreground">WA Groups coming soon</div>
                  ) : (
                    (() => {
                      const visible = displayThreads
                        .filter((c) => (activeInboxFilter === "trash" ? !!c.deletedAt : !c.deletedAt))
                        .filter((c) =>
                          activeInboxFilter === "archived"
                            ? archivedThreadIds.includes(c.id)
                            : activeInboxFilter === "trash"
                              ? true
                              : !archivedThreadIds.includes(c.id),
                        )
                        .filter((c) =>
                          activeInboxFilter === "starred"
                            ? c.starred
                            : activeInboxFilter === "unread"
                              ? c.unreadCount > 0
                              : true,
                        )
                        .filter((c) => !metricFilter || (metricThreadIds?.has(c.id) ?? false))
                        .sort((a, b) => {
                          const ap = pinnedThreadIds.includes(a.id) ? 1 : 0;
                          const bp = pinnedThreadIds.includes(b.id) ? 1 : 0;
                          return bp - ap;
                        });
                      if (visible.length === 0)
                        return (
                          <div className="p-6 text-center text-xs text-muted-foreground">No conversations found</div>
                        );
                      return (
                        <>
                          {visible.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectThread(c.id)}
                          className={`group w-full flex items-start gap-3 p-3 hover:bg-secondary/40 transition-colors text-left ${selectedChatId === c.id ? "bg-secondary/60" : ""}`}
                        >
                          <div className="relative shrink-0">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                              {c.initials}
                            </div>
                            {c.online && (
                              <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center ${c.platform === "whatsapp" ? "bg-[hsl(142_71%_45%)]" : "bg-gradient-to-tr from-pink-500 to-orange-400"}`}
                              aria-label={c.platform}
                            >
                              {c.platform === "whatsapp" ? (
                                <MessageCircle size={8} className="text-white" strokeWidth={3} />
                              ) : (
                                <Instagram size={8} className="text-white" strokeWidth={2.5} />
                              )}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate flex items-center gap-1">
                              {pinnedThreadIds.includes(c.id) && <Pin size={11} className="text-primary shrink-0" />}
                              {mutedThreadIds.includes(c.id) && (
                                <BellOff size={11} className="text-muted-foreground shrink-0" />
                              )}
                              <span className="truncate">{c.name}</span>
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{c.preview}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{c.time}</span>
                            {c.unreadCount > 0 ? (
                              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                                {c.unreadCount}
                              </span>
                            ) : (
                              <span className="h-[18px]" />
                            )}
                            <div className="flex flex-row items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleThreadReadState(c.id, (c.unreadCount || 0) > 0);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleThreadReadState(c.id, (c.unreadCount || 0) > 0);
                                  }
                                }}
                                className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                aria-label={(c.unreadCount || 0) > 0 ? "Mark as read" : "Mark as unread"}
                                title={(c.unreadCount || 0) > 0 ? "Mark as read" : "Mark as unread"}
                              >
                                <MailOpen
                                  size={12}
                                  className={(c.unreadCount || 0) > 0 ? "text-primary" : "text-muted-foreground/40"}
                                />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleStarThread(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleStarThread(c.id);
                                  }
                                }}
                                className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                aria-label={c.starred ? "Unstar conversation" : "Star conversation"}
                                title={c.starred ? "Unstar" : "Star"}
                              >
                                <Star
                                  size={12}
                                  className={c.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
                                />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  togglePinThread(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    togglePinThread(c.id);
                                  }
                                }}
                                className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                aria-label={pinnedThreadIds.includes(c.id) ? "Unpin conversation" : "Pin conversation"}
                                title={pinnedThreadIds.includes(c.id) ? "Unpin" : "Pin"}
                              >
                                <Pin
                                  size={12}
                                  className={
                                    pinnedThreadIds.includes(c.id)
                                      ? "fill-primary text-primary"
                                      : "text-muted-foreground/40"
                                  }
                                />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleMuteThread(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleMuteThread(c.id);
                                  }
                                }}
                                className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                aria-label={mutedThreadIds.includes(c.id) ? "Unmute conversation" : "Mute conversation"}
                                title={mutedThreadIds.includes(c.id) ? "Unmute" : "Mute"}
                              >
                                <BellOff
                                  size={12}
                                  className={
                                    mutedThreadIds.includes(c.id) ? "text-primary" : "text-muted-foreground/40"
                                  }
                                />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleArchiveThread(c.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleArchiveThread(c.id);
                                  }
                                }}
                                className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                aria-label={
                                  archivedThreadIds.includes(c.id) ? "Unarchive conversation" : "Archive conversation"
                                }
                                title={archivedThreadIds.includes(c.id) ? "Unarchive" : "Archive"}
                              >
                                {archivedThreadIds.includes(c.id) ? (
                                  <ArchiveRestore size={12} className="text-primary" />
                                ) : (
                                  <Archive size={12} className="text-muted-foreground/40" />
                                )}
                              </span>
                              {c.dbId && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleSoftDeleteThread(c);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      toggleSoftDeleteThread(c);
                                    }
                                  }}
                                  className="cursor-pointer p-0.5 rounded hover:bg-secondary"
                                  aria-label={c.deletedAt ? "Restore conversation" : "Delete conversation"}
                                  title={c.deletedAt ? "Restore" : "Delete"}
                                >
                                  {c.deletedAt ? (
                                    <RotateCcw size={12} className="text-primary" />
                                  ) : (
                                    <Trash2 size={12} className="text-muted-foreground/40" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                         </button>
                          ))}
                          {activeInboxFilter === "all" &&
                            !metricFilter &&
                            !inboxSearch.trim() &&
                            inboxTotalCount !== null &&
                            dynamicThreads.length < inboxTotalCount && (
                              <div className="p-3 text-center">
                                <button
                                  type="button"
                                  disabled={loadingMoreThreads}
                                  onClick={() => {
                                    if (loadingMoreThreads) return;
                                    setLoadingMoreThreads(true);
                                    const next = inboxLoadedCountRef.current + 100;
                                    inboxLoadedCountRef.current = next;
                                    setInboxLoadedCount(next);
                                    Promise.resolve(loadWhatsAppInbox()).finally(() => setLoadingMoreThreads(false));
                                  }}
                                  className="inline-flex items-center gap-2 text-xs text-primary hover:underline disabled:opacity-60 disabled:no-underline"
                                >
                                  {loadingMoreThreads && <Loader2 size={12} className="animate-spin" />}
                                  {loadingMoreThreads
                                    ? "Loading conversations…"
                                    : `Load more conversations (${dynamicThreads.length} of ${inboxTotalCount})`}
                                </button>
                              </div>
                            )}
                        </>
                      );
                    })()
                  )}
                </div>
              </div>
              {selectedThread ? (
                <div className="flex-1 flex flex-col bg-secondary/10">
                  <div className="flex items-center gap-3 border-b px-4 py-3 bg-background">
                    <div className="relative shrink-0">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                        {selectedThread.initials}
                      </div>
                      {selectedThread.online && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{selectedThread.name}</p>
                        {selectedThread.online && (
                          <Badge variant="outline" className="text-[10px] text-success border-success/40">
                            ● Online
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{selectedThread.phone}</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {(chatMessages[selectedChatId!] || []).map((m) => (
                      <div
                        key={m.id}
                        className={`flex items-end gap-1.5 ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                      >
                        {m.direction === "out" && m.failed && (
                          <span className="flex items-center gap-1 text-[10px] text-destructive">
                            <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                            Failed
                          </span>
                        )}
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === "out" ? (m.failed ? "bg-destructive/10 text-foreground border border-destructive/40" : "bg-primary text-primary-foreground") : "bg-background border"}`}
                        >
                          {m.imageUrl ? (
                            <div
                              className="relative group inline-block cursor-pointer"
                              onClick={() =>
                                setLightbox({
                                  open: true,
                                  url: m.imageUrl,
                                  kind: "image",
                                  mime: m.mediaMime,
                                  filename: m.mediaFilename,
                                })
                              }
                            >
                              <img
                                src={m.imageUrl}
                                alt={m.imageKind === "sticker" ? "sticker" : "image"}
                                className={
                                  m.imageKind === "sticker"
                                    ? "h-24 w-24 object-contain"
                                    : "max-w-full max-h-64 rounded object-contain"
                                }
                                loading="lazy"
                              />
                              {m.direction === "in" && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-7 w-7 bg-black/60 text-white hover:bg-black/80 border-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadMedia(
                                        m.imageUrl!,
                                        m.mediaFilename,
                                        extensionFromMime(m.mediaMime) || (m.imageKind === "sticker" ? "webp" : "jpg"),
                                      );
                                    }}
                                    title="Download"
                                  >
                                    <Download size={14} />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : m.mediaKind === "video" && m.mediaUrl ? (
                            <div
                              className="relative group inline-block cursor-pointer"
                              onClick={() =>
                                setLightbox({
                                  open: true,
                                  url: m.mediaUrl,
                                  kind: "video",
                                  mime: m.mediaMime,
                                  filename: m.mediaFilename,
                                })
                              }
                            >
                              <video src={m.mediaUrl} controls className="max-w-full max-h-64 rounded" />
                              {m.direction === "in" && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-7 w-7 bg-black/60 text-white hover:bg-black/80 border-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadMedia(
                                        m.mediaUrl!,
                                        m.mediaFilename,
                                        extensionFromMime(m.mediaMime) || "mp4",
                                      );
                                    }}
                                    title="Download"
                                  >
                                    <Download size={14} />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : m.mediaKind === "audio" && m.mediaUrl ? (
                            <audio src={m.mediaUrl} controls className="max-w-full" />
                          ) : m.mediaKind === "document" && m.mediaUrl ? (
                            <div className="relative group inline-block">
                              <a
                                href={m.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`flex items-center gap-2 rounded-md px-2 py-1.5 no-underline ${m.direction === "out" ? "bg-primary-foreground/10 text-primary-foreground" : "bg-muted text-foreground"}`}
                              >
                                <FileText size={18} className="opacity-80 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {m.mediaFilename || m.text?.replace(/^\[document\]\s*/, "") || "Document"}
                                  </p>
                                  <p className="text-[10px] opacity-70">Download / View</p>
                                </div>
                              </a>
                              {m.direction === "in" && (
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="secondary"
                                    className="h-7 w-7 bg-black/60 text-white hover:bg-black/80 border-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadMedia(
                                        m.mediaUrl!,
                                        m.mediaFilename,
                                        extensionFromMime(m.mediaMime) || "pdf",
                                      );
                                    }}
                                    title="Download"
                                  >
                                    <Download size={14} />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : m.sticker ? (
                            <span className="text-4xl leading-none">{m.sticker}</span>
                          ) : m.attachmentName ? (
                            <div
                              className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${m.direction === "out" ? "bg-primary-foreground/10" : "bg-muted"}`}
                            >
                              <Paperclip size={14} className="opacity-80" />
                              <span className="text-xs font-medium truncate max-w-[180px]">{m.attachmentName}</span>
                            </div>
                          ) : m.templateInfo &&
                            templates.find(
                              (t: any) => t.name === m.templateInfo!.name && String(t?.body || "").trim(),
                            ) ? (
                            <WhatsAppTemplateMessage
                              info={m.templateInfo}
                              def={templates.find((t: any) => t.name === m.templateInfo!.name)}
                              fallbackText={m.text}
                              compact
                            />
                          ) : (
                            <p className="whitespace-pre-wrap">{m.text}</p>
                          )}

                          {m.direction === "out" &&
                            m.templateName &&
                            !(
                              m.templateInfo &&
                              templates.find(
                                (t: any) => t.name === m.templateInfo!.name && String(t?.body || "").trim(),
                              )
                            ) &&
                            (() => {
                              const tpl = templates.find((t: any) => t.name === m.templateName);
                              const btns: any[] = Array.isArray(tpl?.buttons) ? tpl.buttons : [];
                              if (!btns.length) return null;
                              const urlParams = m.buttonUrlParams || [];
                              let urlIdx = 0;
                              const iconFor = (b: any) => {
                                const type = String(b?.type || "").toUpperCase();
                                const text = String(b?.text || "").toLowerCase();
                                if (type === "PHONE_NUMBER") return <Phone size={13} />;
                                if (type === "URL") {
                                  if (text.includes("location") || text.includes("map")) return <MapPin size={13} />;
                                  return <ExternalLink size={13} />;
                                }
                                return <Reply size={13} />;
                              };
                              const hrefFor = (b: any): string | null => {
                                const type = String(b?.type || "").toUpperCase();
                                if (type === "PHONE_NUMBER") {
                                  const p = String(b?.phone_number || "").replace(/\s+/g, "");
                                  return p ? `tel:${p}` : null;
                                }
                                if (type === "URL") {
                                  const raw = String(b?.url || "");
                                  if (!raw) return null;
                                  if (raw.includes("{{1}}")) {
                                    const param = urlParams[urlIdx++] || "";
                                    return param ? raw.replace("{{1}}", param) : null;
                                  }
                                  return raw;
                                }
                                return null;
                              };
                              return (
                                <div className="mt-2 -mx-1 space-y-1 border-t border-primary-foreground/20 pt-1.5">
                                  {btns.map((b: any, i: number) => {
                                    const href = hrefFor(b);
                                    const label = String(b?.text || "Button");
                                    const cls =
                                      "flex items-center justify-center gap-1.5 w-full rounded px-2 py-1.5 text-xs font-medium bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors";
                                    if (href) {
                                      return (
                                        <a
                                          key={i}
                                          href={href}
                                          target={href.startsWith("http") ? "_blank" : undefined}
                                          rel="noopener noreferrer"
                                          className={cls}
                                        >
                                          {iconFor(b)}
                                          <span className="truncate">{label}</span>
                                        </a>
                                      );
                                    }
                                    return (
                                      <span
                                        key={i}
                                        className={`${cls} opacity-60 cursor-not-allowed`}
                                        title="Action unavailable"
                                      >
                                        {iconFor(b)}
                                        <span className="truncate">{label}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] opacity-70">{m.time}</span>
                            {m.direction === "out" &&
                              m.status &&
                              (() => {
                                const s = m.status;
                                const title =
                                  s === "failed"
                                    ? m.errorReason
                                      ? `Failed: ${getFriendlyError(m.errorReason)}`
                                      : "Failed"
                                    : s.charAt(0).toUpperCase() + s.slice(1);
                                if (s === "sending")
                                  return (
                                    <span title={title} className="inline-flex opacity-70">
                                      <Clock size={12} />
                                    </span>
                                  );
                                if (s === "sent")
                                  return (
                                    <span title={title} className="inline-flex opacity-70">
                                      <Check size={12} />
                                    </span>
                                  );
                                if (s === "delivered")
                                  return (
                                    <span title={title} className="inline-flex opacity-70">
                                      <CheckCheck size={12} />
                                    </span>
                                  );
                                if (s === "read")
                                  return (
                                    <span title={title} className="inline-flex text-sky-300">
                                      <CheckCheck size={12} />
                                    </span>
                                  );
                                return (
                                  <span title={title} className="inline-flex text-destructive">
                                    <AlertCircle size={12} />
                                  </span>
                                );
                              })()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {loadingThreadKey === selectedChatId && (chatMessages[selectedChatId!] || []).length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-8">Loading messages…</p>
                    )}
                    {loadingThreadKey !== selectedChatId && (chatMessages[selectedChatId!] || []).length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-8">No messages yet. Say hi 👋</p>
                    )}
                  </div>
                  <div className="border-t bg-background">
                    {!hasInboundInLast24h && sendMode === "text" && (
                      <div className="px-3 pt-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-200 py-1.5">
                        This contact hasn't messaged you in 24 h. Free-text won't be delivered — pick an approved
                        template.
                      </div>
                    )}
                    <div className="px-3 pt-2 flex items-center gap-2">
                      <Select value={sendMode} onValueChange={(v) => setSendMode(v as "text" | "template")}>
                        <SelectTrigger className="h-8 w-[190px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Free text (24 h window)</SelectItem>
                          <SelectItem value="template">Template message</SelectItem>
                        </SelectContent>
                      </Select>
                      {sendMode === "template" && (
                        <Select
                          value={customTemplateMode ? "__custom__" : selectedTemplateName}
                          onValueChange={(v) => {
                            if (v === "__custom__") {
                              setCustomTemplateMode(true);
                              setSelectedTemplateName("");
                            } else {
                              setCustomTemplateMode(false);
                              setSelectedTemplateName(v);
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue placeholder="Choose approved template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {approvedTemplates.length === 0 && (
                              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No approved templates</div>
                            )}
                            {approvedTemplates.map((t) => (
                              <SelectItem key={t.id} value={t.name}>
                                {t.name}
                              </SelectItem>
                            ))}
                            <SelectItem value="__custom__">✏️ Custom template name…</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {sendMode === "template" && customTemplateMode && (
                      <div className="px-3 pt-2 flex gap-2">
                        <Input
                          value={customTemplateName}
                          onChange={(e) => setCustomTemplateName(e.target.value)}
                          placeholder="Exact template name from Meta (e.g. appointment_reminder)"
                          className="h-8 flex-1 text-xs font-mono"
                        />
                        <Input
                          value={customTemplateLang}
                          onChange={(e) => setCustomTemplateLang(e.target.value)}
                          placeholder="en_US"
                          className="h-8 w-24 text-xs font-mono"
                        />
                      </div>
                    )}
                    {pendingMedia && sendMode === "text" && (
                      <div className="px-3 pt-2">
                        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                          {pendingMedia.kind === "image" ? (
                            <img
                              src={pendingMedia.dataUrl}
                              alt={pendingMedia.name}
                              className="h-14 w-14 object-cover rounded"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded bg-background border flex items-center justify-center">
                              <Paperclip size={20} className="text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{pendingMedia.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {pendingMedia.kind.charAt(0).toUpperCase() + pendingMedia.kind.slice(1)} · ready to send
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setPendingMedia(null)}
                            title="Remove"
                          >
                            <X size={14} />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="p-3 flex gap-2 items-center">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={sendMode === "template"}
                            title="Emoji"
                          >
                            <Smile size={18} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[260px] p-2" align="start">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">
                            Emoji
                          </p>
                          <div className="grid grid-cols-8 gap-1">
                            {[
                              "😀",
                              "😁",
                              "😂",
                              "🤣",
                              "😊",
                              "😍",
                              "😘",
                              "😎",
                              "🙂",
                              "🙃",
                              "😉",
                              "😇",
                              "🥰",
                              "😋",
                              "🤗",
                              "🤔",
                              "😴",
                              "🤤",
                              "😢",
                              "😭",
                              "😡",
                              "😱",
                              "🤯",
                              "🥳",
                              "👍",
                              "👎",
                              "👏",
                              "🙏",
                              "🙌",
                              "💪",
                              "👌",
                              "✌️",
                              "❤️",
                              "🔥",
                              "✨",
                              "🎉",
                              "🎂",
                              "🌸",
                              "🌟",
                              "☀️",
                              "🦷",
                              "💊",
                              "💉",
                              "🩺",
                              "📅",
                              "📞",
                              "📸",
                              "📎",
                            ].map((e) => (
                              <button
                                key={e}
                                type="button"
                                className="h-8 w-8 text-lg hover:bg-secondary rounded"
                                onClick={() => setDraftMessage((m) => m + e)}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            disabled={!selectedChatId || sendingDraft}
                            title="Sticker"
                          >
                            <StickerIcon size={18} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[260px] p-2" align="start">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1 pb-1">
                            Stickers
                          </p>
                          <div className="grid grid-cols-4 gap-2">
                            {["🦷", "😷", "🥳", "🎉", "💐", "🌟", "👍", "🙏", "❤️", "💯", "🔥", "✨"].map((s) => (
                              <button
                                key={s}
                                type="button"
                                className="h-14 w-full text-3xl bg-secondary hover:bg-secondary/70 rounded"
                                onClick={() => {
                                  // Append emoji into draft — do NOT auto-send.
                                  setDraftMessage((m) => m + s);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <label
                        className={`inline-flex items-center justify-center h-9 w-9 shrink-0 rounded-md ${!selectedChatId || sendingDraft || sendMode === "template" ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-secondary"}`}
                        title="Attach file"
                      >
                        <Paperclip size={18} />
                        <input
                          type="file"
                          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                          className="hidden"
                          disabled={!selectedChatId || sendingDraft || sendMode === "template"}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.currentTarget.value = "";
                            if (!f || !selectedChatId) return;
                            if (f.size > 16 * 1024 * 1024) {
                              toast({
                                title: "File too large",
                                description: "Max 16 MB per attachment.",
                                variant: "destructive",
                              });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const dataUrl = String(reader.result || "");
                              const mt = (f.type || "").toLowerCase();
                              const kind: "image" | "video" | "audio" | "document" = mt.startsWith("image/")
                                ? "image"
                                : mt.startsWith("video/")
                                  ? "video"
                                  : mt.startsWith("audio/")
                                    ? "audio"
                                    : "document";
                              setPendingMedia({
                                kind,
                                name: f.name,
                                mime: f.type || "application/octet-stream",
                                dataUrl,
                              });
                            };
                            reader.readAsDataURL(f);
                          }}
                        />
                      </label>

                      <Input
                        value={
                          sendMode === "template"
                            ? customTemplateMode
                              ? ""
                              : (approvedTemplates.find((t) => t.name === selectedTemplateName)?.body ?? "")
                            : draftMessage
                        }
                        onChange={(e) => setDraftMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendChat();
                          }
                        }}
                        placeholder={
                          sendMode === "template"
                            ? customTemplateMode
                              ? "Custom template — body served from Meta"
                              : "Template preview (read-only)"
                            : "Type a message..."
                        }
                        disabled={sendMode === "template" || sendingDraft}
                      />
                      <Button
                        onClick={handleSendChat}
                        disabled={
                          sendingDraft ||
                          (sendMode === "text"
                            ? !draftMessage.trim() && !pendingMedia
                            : customTemplateMode
                              ? !customTemplateName.trim()
                              : !selectedTemplateName)
                        }
                      >
                        <Send size={14} className="mr-1.5" />
                        {sendingDraft ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-secondary/20">
                  <div className="relative">
                    <MessageSquare size={56} className="text-muted-foreground/30" />
                    <MessageSquare size={40} className="text-muted-foreground/20 absolute -bottom-2 -right-4" />
                  </div>
                  <p className="text-sm text-muted-foreground">Select a conversation to view messages</p>
                  <Button size="sm" onClick={() => setNewMessageOpen(true)}>
                    <Plus size={14} className="mr-1.5" />
                    Create new message
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card className="shadow-card">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {campaigns.map((c: any) => (
                  <div key={c.id} className="px-6 py-4 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{c.name}</p>
                      <Badge className={`text-xs ${campaignStatusColors[c.status] || ""}`}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.message_template}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{c.target_segment}</span>
                      <span>Recipients: {c.total_recipients}</span>
                      {c.sent_count > 0 && (
                        <div className="flex items-center gap-2 flex-1">
                          <Progress
                            value={c.total_recipients > 0 ? (c.delivered_count / c.total_recipients) * 100 : 0}
                            className="h-1.5 flex-1"
                          />
                          <span>
                            {c.delivered_count}/{c.total_recipients}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {campaigns.length === 0 && (
                  <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                    No campaigns yet. Create your first campaign above.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="single-send">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Single Send</span>
                  <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
                    Editor Test: Working
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Send a one-off WhatsApp message to a single contact using an approved template.
                </p>
                {syncingTemplates && <p className="text-xs text-muted-foreground">Syncing templates from Meta…</p>}
                {!syncingTemplates && approvedTemplates.length === 0 && (
                  <p className="text-xs text-destructive">
                    No approved Meta templates found. Open the Templates tab and click Sync, or create/approve a
                    template in Meta first.
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Recipient</Label>
                  <div className="relative">
                    <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search contact or enter phone number..."
                      value={singleSend.recipient}
                      onChange={(e) => setSingleSend((s) => ({ ...s, recipient: e.target.value }))}
                    />
                  </div>
                  {checkingRecipient && <p className="text-[11px] text-muted-foreground">Checking WhatsApp number…</p>}
                  {!checkingRecipient && recipientCheck && !recipientCheck.ok && (
                    <p className="text-[11px] text-destructive">{recipientCheck.reason || NOT_ON_WHATSAPP_MESSAGE}</p>
                  )}
                  {!checkingRecipient && recipientCheck?.ok && (
                    <p className="text-[11px] text-success">Number validated — safe to send.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Customer name</Label>
                  <Input
                    placeholder="Value for {{1}}"
                    value={singleSend.customerName}
                    onChange={(e) => setSingleSend((s) => ({ ...s, customerName: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Template / Content</Label>
                  <Select
                    value={singleSend.templateName}
                    onValueChange={(v) => {
                      const tpl = approvedTemplates.find((mt) => mt.name === v);
                      setSingleSend((s) => ({ ...s, templateName: v, message: tpl?.body ?? s.message }));
                      setSingleParams(Array(countPlaceholders(tpl?.body || "")).fill(""));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select approved template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {approvedTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.name}>
                          {t.name} ({t.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {singleTemplateParamCount > 1 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Additional template parameters</Label>
                    <div className="grid gap-2">
                      {Array.from({ length: singleTemplateParamCount - 1 }).map((_, offset) => {
                        const i = offset + 1;
                        return (
                          <Input
                            key={i}
                            placeholder={`Value for {{${i + 1}}}`}
                            value={singleParams[i] ?? ""}
                            onChange={(e) =>
                              setSingleParams((prev) => {
                                const next = [...prev];
                                while (next.length < singleTemplateParamCount) next.push("");
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Message</Label>
                  <Textarea
                    rows={5}
                    placeholder="Message content will appear here..."
                    value={singleSend.message.replace(/\{\{\s*1\s*\}\}/g, singleSend.customerName || "{{1}}")}
                    onChange={(e) => setSingleSend((s) => ({ ...s, message: e.target.value }))}
                  />
                </div>
                {singleMedia && (
                  <div className="rounded-md border bg-muted/30 p-3 flex items-center gap-3">
                    {singleMedia.kind === "image" ? (
                      <img
                        src={singleMedia.dataUrl}
                        alt={singleMedia.name}
                        className="h-16 w-16 object-cover rounded"
                      />
                    ) : singleMedia.kind === "video" ? (
                      <video src={singleMedia.dataUrl} className="h-16 w-16 object-cover rounded bg-black" />
                    ) : (
                      <div className="h-16 w-16 rounded bg-secondary flex items-center justify-center">
                        <Paperclip size={22} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{singleMedia.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {singleMedia.kind.charAt(0).toUpperCase() + singleMedia.kind.slice(1)} · ready to send
                        {singleSend.message.trim() ? " · caption included" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-destructive underline"
                      onClick={() => setSingleMedia(null)}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {(() => {
                  const templateHasHeaderMedia = ["IMAGE", "VIDEO", "DOCUMENT"].includes(singleTemplateHeaderFormat);
                  if (templateHasHeaderMedia && singleMedia) {
                    // Auto-clear a stale local attachment so the template's own header media is used.
                    setTimeout(() => setSingleMedia(null), 0);
                  }
                  return (
                    <div className="space-y-3">
                      {templateHasHeaderMedia && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">
                            Header Media URL ({singleTemplateHeaderFormat.toLowerCase()})
                          </Label>
                          <Input
                            placeholder="https://... (leave empty to use template's default header media)"
                            value={singleHeaderMediaUrl}
                            onChange={(e) => setSingleHeaderMediaUrl(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Must be a public HTTPS URL to an {singleTemplateHeaderFormat.toLowerCase()} file.
                          </p>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <label
                          className={`inline-flex ${templateHasHeaderMedia ? "pointer-events-none" : ""}`}
                          title={templateHasHeaderMedia ? "This template already includes header media." : undefined}
                        >
                          <input
                            type="file"
                            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                            className="hidden"
                            disabled={templateHasHeaderMedia}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.currentTarget.value = "";
                              if (!f) return;
                              if (f.size > 16 * 1024 * 1024) {
                                toast({
                                  title: "File too large",
                                  description: "Max 16 MB per attachment.",
                                  variant: "destructive",
                                });
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                const mt = (f.type || "").toLowerCase();
                                const kind: "image" | "video" | "audio" | "document" = mt.startsWith("image/")
                                  ? "image"
                                  : mt.startsWith("video/")
                                    ? "video"
                                    : mt.startsWith("audio/")
                                      ? "audio"
                                      : "document";
                                setSingleMedia({
                                  kind,
                                  name: f.name,
                                  mime: f.type || "application/octet-stream",
                                  dataUrl: String(reader.result || ""),
                                });
                              };
                              reader.readAsDataURL(f);
                            }}
                          />
                          <span
                            className={`inline-flex items-center h-9 px-3 rounded-md border text-sm ${templateHasHeaderMedia ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-secondary"}`}
                            title={templateHasHeaderMedia ? "This template already includes header media." : undefined}
                          >
                            <Paperclip size={14} className="mr-1.5" />
                            {singleMedia ? "Change Media" : "Attach Media"}
                          </span>
                        </label>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() => {
                              setSingleSend({ recipient: "", customerName: "", templateName: "", message: "" });
                              setSingleParams([]);
                              setSingleMedia(null);
                              setSingleHeaderMediaUrl("");
                            }}
                            disabled={sendingSingle}
                          >
                            Reset Form
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSingleSend}
                            disabled={
                              sendingSingle ||
                              checkingRecipient ||
                              (recipientCheck ? !recipientCheck.ok : false) ||
                              (!singleMedia && (syncingTemplates || approvedTemplates.length === 0))
                            }
                          >
                            <Send size={14} className="mr-1.5" />
                            {sendingSingle ? "Sending…" : "Send Message"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {lastSend && (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Last send delivery status</span>
                      <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        onClick={() => setLastSend(null)}
                      >
                        clear
                      </button>
                    </div>
                    <div className="text-muted-foreground">
                      To <span className="font-mono">{lastSend.to}</span>
                    </div>
                    <div className="text-muted-foreground break-all">
                      wamid: <span className="font-mono">{lastSend.messageId}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["accepted", "sent", "delivered", "read"] as const).map((s) => {
                        const order = ["accepted", "sent", "delivered", "read"];
                        const reached = order.indexOf(lastSend.status) >= order.indexOf(s) || lastSend.status === s;
                        const failed = lastSend.status === "failed";
                        return (
                          <span
                            key={s}
                            className={`rounded-full px-2 py-0.5 text-[10px] border ${failed ? "opacity-40" : reached ? "bg-green-500/15 text-green-700 border-green-500/30" : "bg-background text-muted-foreground"}`}
                          >
                            {s}
                          </span>
                        );
                      })}
                      {lastSend.status === "failed" && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] border bg-destructive/15 text-destructive border-destructive/30">
                          failed
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Updated {new Date(lastSend.statusAt).toLocaleTimeString()}
                    </div>
                    {lastSend.status === "failed" && (lastSend.errorCode || lastSend.errorMessage) && (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[10px] text-destructive">
                        {lastSend.errorCode ? `Meta error ${lastSend.errorCode}` : "Meta error"}
                        {lastSend.errorMessage ? `: ${lastSend.errorMessage}` : ""}
                      </div>
                    )}
                    {lastSend.error && (
                      <pre className="whitespace-pre-wrap break-all rounded bg-destructive/10 p-2 text-[10px] text-destructive">
                        {JSON.stringify(lastSend.error, null, 2)}
                      </pre>
                    )}
                    {(() => {
                      const sendAtMs = new Date(lastSend.statusAt).getTime();
                      const lastStatusEventMs = waWebhookHealth?.last_status_event_at
                        ? new Date(waWebhookHealth.last_status_event_at as string).getTime()
                        : 0;
                      const stuckAccepted =
                        lastSend.status === "accepted" && Date.now() - sendAtMs > 2 * 60 * 1000;
                      const webhookSilent = lastStatusEventMs === 0 || lastStatusEventMs < sendAtMs;
                      return stuckAccepted && webhookSilent ? (
                        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400 space-y-1">
                          <p className="font-medium">Webhook not receiving status events from Meta</p>
                          <p>
                            No delivery-status event has reached the backend since this send. The message may already
                            be delivered — the status pipeline is broken, not the send. Check that the Meta App Secret
                            saved in the backend secrets matches your Meta app, and that the webhook is subscribed to
                            the <span className="font-mono">messages</span> field.
                          </p>
                        </div>
                      ) : null;
                    })()}
                    <p className="text-[10px] text-muted-foreground">
                      Statuses update live from the Meta webhook. If the recipient never receives the message, check
                      that your WhatsApp number is opted-in and that the webhook URL is configured in Meta.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <WhatsAppTemplatePreview
              template={singleTemplate}
              paramValues={Array.from({ length: Math.max(singleTemplateParamCount, 1) }, (_, i) =>
                i === 0 ? singleSend.customerName : singleParams[i] || "",
              )}
            />
          </div>

          <Card className="shadow-card mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span>
                  {metricFilter === "responses"
                    ? "Responses received"
                    : metricFilter === "delivered"
                      ? "Delivered messages"
                      : metricFilter === "read"
                        ? "Read messages"
                        : metricFilter === "failed"
                          ? "Failed messages"
                          : "Recent sends"}
                </span>
                {metricFilter && (
                  <Button size="sm" variant="outline" onClick={() => setMetricFilter(null)}>
                    Clear filter
                  </Button>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Click any metric card above to filter this list. Showing the selected dashboard date range.
              </p>
            </CardHeader>
            <CardContent>
              {singleSendListLoading && singleSendMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading messages…</p>
              ) : singleSendMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No messages found for this filter and date range.
                </p>
              ) : (
                <div className="max-h-[420px] overflow-y-auto divide-y">
                  {singleSendMessages.map((m) => (
                    <div key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.phone}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.template}
                          {m.text ? ` · ${m.text}` : ""}
                        </p>
                        {m.errorCode && (
                          <p className="text-[11px] text-destructive mt-0.5">
                            {m.errorCode}
                            {m.errorTitle ? ` · ${m.errorTitle}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <Badge variant="outline" className="capitalize">
                          {m.status}
                        </Badge>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {m.at ? new Date(m.at).toLocaleString() : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <div className="space-y-4">
            <Card className="shadow-card">
              <CardContent className="p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-[11px] text-muted-foreground">Search</Label>
                    <div className="relative">
                      <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={tplSearchDraft}
                        onChange={(e) => setTplSearchDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") applyTplFilters();
                        }}
                        placeholder="Search name or category"
                        className="h-9 pl-7"
                      />
                    </div>
                  </div>
                  <div className="w-[140px]">
                    <Label className="text-[11px] text-muted-foreground">Language</Label>
                    <Select value={tplLangDraft} onValueChange={setTplLangDraft}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {tplLanguageOptions.map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[150px]">
                    <Label className="text-[11px] text-muted-foreground">Sort</Label>
                    <Select value={tplSortDraft} onValueChange={setTplSortDraft}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="latest">Latest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="az">A - Z</SelectItem>
                        <SelectItem value="za">Z - A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[110px]">
                    <Label className="text-[11px] text-muted-foreground">Per Page</Label>
                    <Select value={tplPerPageDraft} onValueChange={setTplPerPageDraft}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="15">15</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9" onClick={applyTplFilters}>
                      Apply
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={resetTplFilters}>
                      Reset
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3 pt-3 border-t">
                  <span className="text-[11px] text-muted-foreground">
                    Showing {filteredTemplates.length} of {templates.length} templates
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={tplSearchDraft}
                        onChange={(e) => {
                          setTplSearchDraft(e.target.value);
                          setTplSearch(e.target.value);
                        }}
                        placeholder="Search templates by name or text..."
                        className="h-8 pl-8 text-xs w-full sm:w-[220px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { key: "all", label: "All" },
                          { key: "approved", label: "Approved" },
                          { key: "pending", label: "Pending" },
                          { key: "rejected", label: "Rejected" },
                        ] as const
                      ).map((pill) => {
                        const active = tplStatus === pill.key;
                        return (
                          <button
                            key={pill.key}
                            type="button"
                            onClick={() => {
                              setTplStatusDraft(pill.key);
                              setTplStatus(pill.key);
                            }}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"}`}
                          >
                            {pill.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {lastSyncedAt && (
                    <span className="text-[11px] text-muted-foreground sm:ml-auto">
                      Last synced: {new Date(lastSyncedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-10 border border-dashed rounded-md">
                  No templates match the current filters.
                </div>
              )}
              {filteredTemplates.map((t) => {
                const categoryKey = String(t.category || "").toLowerCase();
                const CategoryIcon =
                  categoryKey === "marketing"
                    ? TrendingUp
                    : categoryKey === "utility"
                      ? FileText
                      : categoryKey === "authentication"
                        ? Shield
                        : Tag;
                const statusIcon =
                  t.status === "approved" ? (
                    <CheckCircle size={10} className="mr-1" />
                  ) : t.status === "pending" ? (
                    <Clock size={10} className="mr-1" />
                  ) : t.status === "rejected" ? (
                    <XCircle size={10} className="mr-1" />
                  ) : null;
                const bodyParts = (t.body || "").split(/(\{\{\s*\d+\s*\}\})/g);
                return (
                  <Card key={t.id} className="shadow-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold font-mono break-all">{t.name}</p>
                        <Badge
                          className={`text-[10px] shrink-0 border-0 ${templateStatusColors[t.status] || "bg-secondary text-muted-foreground"}`}
                        >
                          {statusIcon}
                          {t.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[10px] flex items-center gap-1 capitalize">
                          <CategoryIcon size={10} />
                          {t.category}
                        </Badge>
                        {t.language && (
                          <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                            <Globe size={9} />
                            {t.language}
                          </Badge>
                        )}
                        {getMappedHeaderImageUrl(t.name) && (
                          <a
                            href={getMappedHeaderImageUrl(t.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border hover:text-foreground hover:border-primary/40 transition-colors"
                            title="Open the mapped Supabase Storage asset in a new tab"
                          >
                            <ImageIcon size={9} />
                            View Mapped Asset
                          </a>
                        )}
                      </div>

                      <div className="bg-muted/40 rounded-md p-3 text-xs text-muted-foreground min-h-[64px] whitespace-pre-wrap break-words">
                        {bodyParts.map((part, i) =>
                          /^\{\{\s*\d+\s*\}\}$/.test(part) ? (
                            <span
                              key={i}
                              className="inline-block px-1 py-0.5 rounded bg-primary/10 text-primary font-medium text-[10px] mx-0.5"
                            >
                              {part}
                            </span>
                          ) : (
                            <span key={i}>{part}</span>
                          ),
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-[10px] text-muted-foreground">
                          {t.last_synced ? `Synced ${new Date(t.last_synced).toLocaleString()}` : "Not synced yet"}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Copy text"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(t.body || "");
                                toast({ title: "Template text copied to clipboard!" });
                              } catch {
                                toast({ title: "Copy failed", variant: "destructive" });
                              }
                            }}
                          >
                            <Copy size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => handleEditTemplate(t)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setViewTemplate(t)}
                          >
                            View Menu
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                            onClick={() => handleDeleteTemplate(t)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Dialog
              open={!!viewTemplate}
              onOpenChange={(open) => {
                if (!open) setViewTemplate(null);
              }}
            >
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-display">{viewTemplate?.name || "Template details"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[50vh]">
                    {viewTemplate ? JSON.stringify(viewTemplate, null, 2) : ""}
                  </div>
                </div>
                <DialogFooter>
                  <Button size="sm" onClick={() => setViewTemplate(null)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="bot">
          <div className="space-y-4">
            {botRules.map((rule) => (
              <Card key={rule.id} className="shadow-card">
                <CardContent className="p-4 flex items-start gap-4">
                  <Bot size={18} className="text-primary mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-medium text-muted-foreground">When message contains:</p>
                      <div className="flex gap-1 flex-wrap">
                        {rule.trigger.split("|").map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="bg-secondary/50 rounded-md p-3 text-xs whitespace-pre-line">{rule.response}</div>
                  </div>
                  <Switch checked={rule.active} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="account">
          {(() => {
            const ah = liveInsights?.accountHealth;
            const bp = liveInsights?.businessProfile;
            const conn = liveInsights?.connection;
            const displayName = bp?.displayName || ah?.displayName || "—";
            const phoneNumber = bp?.phoneNumber || ah?.phoneNumber || "—";
            const phoneNumberId = bp?.phoneNumberId || ah?.phoneNumberId || conn?.phoneNumberId || "—";
            const wabaId = bp?.wabaId || ah?.wabaId || conn?.wabaId || "—";
            const searchVisibility = ah?.searchVisibility || "NON VISIBLE";
            const lastSync = ah?.lastSyncedAt ? new Date(ah.lastSyncedAt).toLocaleString() : "—";
            const mode = ah?.accountMode
              ? String(ah.accountMode).toUpperCase()
              : liveConnected
                ? "LIVE"
                : "DEVELOPMENT";
            const isLive = mode === "LIVE";
            const nameStatus = ah?.nameStatus ? String(ah.nameStatus).toUpperCase() : "PENDING";
            const qualityRating = labelize(ah?.qualityRating);
            const messagingHealth = ah?.messageHealth ? String(ah.messageHealth).toUpperCase() : "UNKNOWN";
            const tierRaw = ah?.messagingTier ? String(ah.messagingTier).toUpperCase() : "";
            const isUnlimitedTier = tierRaw === "UNLIMITED";
            const dailyLimit = Number.isFinite(Number(ah?.dailyLimit)) ? Number(ah?.dailyLimit) : 0;
            // Display day = viewer-local calendar day (IST for the clinic), so this card
            // matches "Messages Sent" under the "Today" filter. Meta still enforces its
            // quota on a UTC day, so the UTC count is shown as a reference note and drives
            // the progress/remaining figures.
            const sentToday = sentCounters?.todayLocal ?? ah?.sentToday ?? 0;
            const sentTodayUtc = sentCounters?.today ?? ah?.sentToday ?? 0;
            const sentThisMonth = sentCounters?.month ?? 0;
            // Meta resets the daily messaging limit at midnight UTC. Show that exact window in
            // the viewer's own timezone so it can't be confused with the local calendar day.
            const quotaWindow = (() => {
              const now = new Date();
              const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
              const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 60 * 1000);
              const fmt = (d: Date) =>
                d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
              return `${fmt(start)} – ${fmt(end)} local`;
            })();
            const remaining = dailyLimit > 0 ? Math.max(dailyLimit - sentTodayUtc, 0) : 0;
            const tier = tierRaw && tierRaw !== "UNKNOWN" ? tierRaw : "—";
            const dailyLimitLabel = isUnlimitedTier ? "Unlimited" : dailyLimit > 0 ? formatCount(dailyLimit) : "—";
            const qualityColor =
              qualityRating.toLowerCase() === "high"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : qualityRating.toLowerCase() === "medium"
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  : qualityRating.toLowerCase() === "low"
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : "bg-secondary text-muted-foreground";
            const healthColor =
              messagingHealth === "AVAILABLE" || messagingHealth === "GREEN"
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                : messagingHealth === "BLOCKED" || messagingHealth === "RED"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-secondary text-muted-foreground";
            const handleDisconnect = () => {
              if (
                typeof window !== "undefined" &&
                window.confirm("Disconnect WhatsApp Business API? You will need to reconnect to send messages.")
              ) {
                toast({
                  title: "Disconnect requested",
                  description: "Use the connection settings to remove saved credentials.",
                  variant: "destructive",
                });
              }
            };
            return (
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  {/* Header status card */}
                  <Card className="shadow-card">
                    <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                          {liveConnected ? (
                            <CheckCircle size={20} className="text-primary" />
                          ) : (
                            <AlertCircle size={20} className="text-destructive" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            Account Status:{" "}
                            {liveConnected ? (
                              <span className="text-primary">Connected</span>
                            ) : (
                              <span className="text-destructive">Not verified</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Provider: {liveInsights?.provider || conn?.provider || "—"} · Mode: {labelize(mode)} · Last
                            sync: {lastSync}
                          </p>
                          {liveInsights?.error && <p className="text-xs text-destructive mt-1">{liveInsights.error}</p>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={refreshLive}
                        disabled={liveRefreshing || liveLoading}
                      >
                        <RefreshCw size={14} className={liveRefreshing ? "animate-spin" : ""} /> Refresh
                      </Button>
                    </CardContent>
                  </Card>

                  {!liveInsights?.connectionExists && (
                    <Card className="shadow-card border-dashed">
                      <CardContent className="p-6 text-center space-y-3">
                        <Settings size={18} className="mx-auto text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">WhatsApp live connection not saved yet</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Use Connect WhatsApp and save the real Phone Number ID, WABA ID and access token.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Metrics grid */}
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Activity size={16} className="text-primary" />
                          <Badge className={`text-[10px] border ${healthColor}`}>{messagingHealth}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Message Health</p>
                        <p className="text-lg font-bold font-display">{messagingHealth}</p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Shield size={16} className="text-primary" />
                          <Badge className={`text-[10px] border ${qualityColor}`}>{qualityRating}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Quality Score</p>
                        <p className="text-lg font-bold font-display">{ah?.qualityScore ?? 0}/100</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Name status: <span className="font-medium">{nameStatus}</span>
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Gauge size={16} className="text-primary" />
                          <Badge variant="outline" className="text-[10px]">
                            TIER {tier}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Daily Limit</p>
                        <p className="text-lg font-bold font-display tabular-nums truncate">{dailyLimitLabel}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Verification: {labelize(ah?.verificationStatus)}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Send size={16} className="text-primary" />
                          <Badge variant="outline" className="text-[10px]">
                            TODAY (IST)
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Sent Messages (Today, IST day)</p>
                        <p className="text-lg font-bold font-display tabular-nums truncate">
                          {formatCount(sentToday)}
                          {dailyLimit > 0 ? ` / ${formatCount(dailyLimit)}` : isUnlimitedTier ? " / ∞" : ""}
                        </p>
                        <Progress
                          value={dailyLimit > 0 ? Math.min((sentTodayUtc / dailyLimit) * 100, 100) : 0}
                          className="h-1.5 mt-2"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Remaining today:{" "}
                          <span className="font-medium">
                            {isUnlimitedTier ? "Unlimited" : dailyLimit > 0 ? formatCount(remaining) : "—"}
                          </span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Meta quota day (resets 5:30 AM IST):{" "}
                          <span className="font-medium">
                            {formatCount(sentTodayUtc)}
                            {dailyLimit > 0 ? ` / ${formatCount(dailyLimit)}` : isUnlimitedTier ? " / ∞" : ""}
                          </span>{" "}
                          used
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Quota window: {quotaWindow}</p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Activity size={16} className="text-primary" />
                          <Badge
                            className={`text-[10px] border ${isLive ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}
                          >
                            {isLive ? "LIVE" : "DEVELOPMENT"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Account Mode</p>
                        <p className="text-lg font-bold font-display">{isLive ? "LIVE" : "DEVELOPMENT"}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Name Status:{" "}
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {nameStatus}
                          </Badge>
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="shadow-card">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Send size={16} className="text-primary" />
                          <Badge variant="outline" className="text-[10px]">
                            MTD
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Outbound Messages Sent (This Month)</p>
                        <p className="text-lg font-bold font-display">{formatCount(sentThisMonth)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Message count from delivery logs — not a billing amount.
                        </p>
                        <p className="text-[10px] font-medium mt-1">
                          Billing:{" "}
                          {billingAvailable
                            ? formatMoney(pricing?.currentMonthSpend, pricing?.currency)
                            : "Billing data unavailable"}
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab("billing")}
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                        >
                          Billing Payment Settings <ChevronRight size={12} />
                        </button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Business Profile metadata + card */}
                  <Card className="shadow-card">
                    <CardContent className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-b">
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">PHONE NUMBER</p>
                        <p className="text-sm font-medium mt-1">{phoneNumber}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                          PHONE NUMBER ID
                        </p>
                        <p className="text-xs font-mono mt-1 break-all">{phoneNumberId}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">
                          SEARCH VISIBILITY
                        </p>
                        <p className="text-sm font-medium mt-1">{String(searchVisibility).toUpperCase()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">LAST ONBOARDED</p>
                        <p className="text-sm font-medium mt-1">{lastSync}</p>
                      </div>
                    </CardContent>

                    <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                      <CardTitle className="text-base font-display flex items-center gap-2">
                        <Building2 size={16} className="text-primary" /> Business Profile
                      </CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 h-8"
                        onClick={() =>
                          toast({
                            title: "Edit profile",
                            description: "Business profile editing opens from Connect WhatsApp.",
                          })
                        }
                      >
                        <Pencil size={13} /> Edit
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Building2 size={26} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-semibold">{displayName}</p>
                            <Badge variant="secondary" className="text-[10px]">
                              HEALTH
                            </Badge>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2 text-sm">
                            <div className="flex items-start gap-2">
                              <FileText size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Description</p>
                                <p className="text-sm">
                                  {(bp as any)?.description || "AI-powered dental practice management."}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Mail size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Email</p>
                                <p className="text-sm">{(bp as any)?.email || "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Address</p>
                                <p className="text-sm">{(bp as any)?.address || "—"}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Globe size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[10px] text-muted-foreground uppercase">Websites</p>
                                <p className="text-sm break-all">{(bp as any)?.website || bp?.baseUrl || "—"}</p>
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground pt-2 border-t">
                            WABA ID: <span className="font-mono">{wabaId}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right sidebar - Setup Guide */}
                <div className="space-y-4">
                  <Card className="shadow-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-display flex items-center gap-2">
                        <Settings size={15} className="text-primary" /> Setup Guide
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Accordion type="single" collapsible defaultValue="profile">
                        <AccordionItem value="profile">
                          <AccordionTrigger className="text-sm">Setup Your Profile</AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-2 text-xs text-muted-foreground">
                              <li className="flex gap-2">
                                <CheckCircle size={12} className="text-primary mt-0.5" /> Verify business phone number
                              </li>
                              <li className="flex gap-2">
                                <CheckCircle size={12} className="text-primary mt-0.5" /> Upload business logo &
                                description
                              </li>
                              <li className="flex gap-2">
                                <CheckCircle size={12} className="text-primary mt-0.5" /> Add website & address
                              </li>
                              <li className="flex gap-2">
                                <CheckCircle size={12} className="text-primary mt-0.5" /> Submit for display-name
                                approval
                              </li>
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="templates">
                          <AccordionTrigger className="text-sm">Create Templates</AccordionTrigger>
                          <AccordionContent>
                            <p className="text-xs text-muted-foreground">
                              Head to the Templates tab to submit approved message templates for campaigns.
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                        <AccordionItem value="webhook">
                          <AccordionTrigger className="text-sm">Configure Webhook</AccordionTrigger>
                          <AccordionContent>
                            <p className="text-xs text-muted-foreground">
                              Point your Meta webhook to the whatsapp-webhook edge function URL.
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>

                  <Card className="shadow-card border-destructive/30">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Power size={15} className="text-destructive" />
                        <p className="text-sm font-semibold">Danger Zone</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Disconnecting stops all outgoing messages until you reconnect.
                      </p>
                      <Button variant="destructive" size="sm" className="w-full gap-1" onClick={handleDisconnect}>
                        <Power size={14} /> Disconnect
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="analytics">
          <div className="space-y-4">
            <WhatsAppSourceAnalytics />
          </div>


        </TabsContent>

        <TabsContent value="billing">
          <div className="space-y-4">
            <Card className="shadow-card">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <CreditCard size={16} className="text-primary" /> Payment & Billing
                </CardTitle>
                <button
                  type="button"
                  onClick={() => {
                    const url = "https://business.facebook.com/latest/billing_hub/payment_activity/?asset_id=1303942691475826&business_id=109620568636492&payment_account_id=1824999824786034&placement=BILLING_HUB&nav_ref=billing_hub";
                    const newWindow = window.open("about:blank", "_blank");
                    if (newWindow) {
                      newWindow.opener = null;
                      newWindow.location.href = url;
                    }
                  }}
                  className="inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                >
                  <ExternalLink size={14} /> Open Meta Billing & Payments
                </button>
              </CardHeader>
              <CardContent className="text-sm">
                {billingAvailable ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Current Month Spend (Meta reported)</p>
                      <p className="font-bold font-display text-lg">
                        {formatMoney(pricing?.currentMonthSpend, pricing?.currency)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Currency</p>
                      <p className="font-bold">{pricing?.currency}</p>
                    </div>
                  </div>
                ) : (
                  <WhatsAppMetaBilling />
                )}
              </CardContent>
            </Card>

            {billingAvailable && (
              <Card className="shadow-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-display flex items-center gap-2">
                    <DollarSign size={16} className="text-primary" /> Pricing Breakdown (Meta verified)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase">
                      <span>Category</span>
                      <span className="text-right">Conversations</span>
                      <span className="text-right">Rate / conv</span>
                      <span className="text-right">Total Cost</span>
                    </div>
                    {(pricing?.breakdown || []).map((p) => (
                      <div
                        key={p.category}
                        className="grid grid-cols-4 px-4 py-3 text-sm items-center hover:bg-secondary/30"
                      >
                        <span className="font-medium">{p.category}</span>
                        <span className="text-right">{formatCount(p.count)}</span>
                        <span className="text-right text-muted-foreground">
                          {p.rate === 0 ? "Free" : formatMoney(p.rate, p.currency)}
                        </span>
                        <span className="text-right font-semibold">{formatMoney(p.totalCost, p.currency)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="diagnostic">
          <WhatsAppDiagnostics />
        </TabsContent>
      </Tabs>

      <Dialog
        open={newMessageOpen}
        onOpenChange={(o) => {
          setNewMessageOpen(o);
          if (!o) {
            setNewMessageContact("");
            setNewMessageSearch("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new message</DialogTitle>
          </DialogHeader>
          {(() => {
            const q = newMessageSearch.trim();
            const qLower = q.toLowerCase();
            const digitsOnlyQuery = q.replace(/[\s+\-()]/g, "");
            const isManualPhone = q.length >= 6 && /^[\d+\s\-()]+$/.test(q) && /^\d{6,}$/.test(digitsOnlyQuery);
            const pool = dbContacts;
            const filtered = q
              ? pool.filter(
                  (c) =>
                    c.name.toLowerCase().includes(qLower) ||
                    c.phone.replace(/\D/g, "").includes(digitsOnlyQuery.replace(/\D/g, "")),
                )
              : pool;
            const exactPhoneMatch = filtered.some(
              (c) => c.phone.replace(/\D/g, "") === digitsOnlyQuery.replace(/\D/g, ""),
            );
            const showManual = isManualPhone && !exactPhoneMatch;
            const manualValue = `manual:${q}`;
            return (
              <div className="space-y-2 py-2">
                <Label className="text-xs">Search by name or phone</Label>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={newMessageSearch}
                    onChange={(e) => {
                      setNewMessageSearch(e.target.value);
                      setNewMessageContact("");
                    }}
                    placeholder="Type a name or phone number..."
                    className="pl-8"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  {showManual && (
                    <button
                      type="button"
                      onClick={() => setNewMessageContact(manualValue)}
                      className={`w-full text-left px-3 py-2 text-sm border-b hover:bg-secondary/60 ${newMessageContact === manualValue ? "bg-secondary/60" : ""}`}
                    >
                      <span className="text-primary font-medium">Send to unsaved number:</span> {q}
                    </button>
                  )}
                  {filtered.length === 0 && !showManual && (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {dbContacts.length === 0 ? "No patients found — type a phone number to send" : "No matches"}
                    </div>
                  )}
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewMessageContact(c.id)}
                      className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-secondary/60 ${newMessageContact === c.id ? "bg-secondary/60" : ""}`}
                    >
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMessageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleContinueNewMessage} disabled={!newMessageContact}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lightbox.open} onOpenChange={(o) => setLightbox((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-4xl p-0 bg-black/95 border-none overflow-hidden text-primary-foreground">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <DialogTitle className="text-sm font-medium text-white">Preview</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => {
                  if (lightbox.url)
                    downloadMedia(
                      lightbox.url,
                      lightbox.filename,
                      extensionFromMime(lightbox.mime) || (lightbox.kind === "video" ? "mp4" : "jpg"),
                    );
                }}
              >
                <Download size={16} className="mr-1.5" /> Download
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => setLightbox((s) => ({ ...s, open: false }))}
              >
                <X size={18} />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-center p-4 min-h-[300px]">
            {lightbox.kind === "video" && lightbox.url ? (
              <video src={lightbox.url} controls className="max-w-full max-h-[70vh] rounded" />
            ) : (
              <img src={lightbox.url} alt="Preview" className="max-w-full max-h-[70vh] rounded object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppAPI;
