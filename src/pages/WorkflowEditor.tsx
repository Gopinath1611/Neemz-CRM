import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  ChevronDown,
  Monitor,
  Menu as MenuIcon,
  Plus,
  Minus,
  Lock,
  Maximize2,
  Layers,
  FileText,
  Info,
  List,
  Settings as SettingsIcon,
  History,
  RefreshCw,
  Calendar,
  Search,
  CheckCircle2,
  Hourglass,
  Save,
  ClipboardList,
  MonitorCog,
  UserPlus,
  CalendarClock,
  MessageCircle,
  X,
  Infinity as InfinityIcon,
  Network,
  Repeat,
  History as HistoryIcon,
  FilePlus,
  UserCog,
  NotebookTabs,
  Cake,
  CalendarCheck,
  CalendarX,
  CalendarOff,
  CalendarDays,
  ArrowRight,
  Bot,
  Users,
  Award,
  Mail,
  MessageSquare,
  Tag,
  Clock,
  GitBranch,
  Webhook,
  Bell,
  LogOut,
  UserMinus,
  Instagram,
  PlayCircle,
  Trash2,
  BookOpen,
  UsersRound,
  Contact as ContactIcon,
  UserCheck,
  Timer,
  Shuffle,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";

const WorkflowEditor = () => {
  const navigate = useNavigate();
  const { id: workflowId } = useParams<{ id: string }>();
  const [loadingWorkflow, setLoadingWorkflow] = useState<boolean>(!!workflowId);
  const [savingForm, setSavingForm] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [paused, setPaused] = useState(true);
  const [name, setName] = useState("Untitled Automation");
  const [editingName, setEditingName] = useState(false);
  const [allowReentry, setAllowReentry] = useState(true);
  const [specificTime, setSpecificTime] = useState(false);
  const [scheduleEnable, setScheduleEnable] = useState("");
  const [scheduleDisable, setScheduleDisable] = useState("");
  const [activeTool, setActiveTool] = useState<string>("layers");
  const [view, setView] = useState<"editor" | "logs">("editor");
  const [logsTab, setLogsTab] = useState<"all" | "completed" | "pending">("all");
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [versionDesc, setVersionDesc] = useState("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [metaFormOpen, setMetaFormOpen] = useState(false);
  const [metaForms, setMetaForms] = useState<Array<{ id: string; name: string; status?: string }>>([]);
  const [metaFormsLoading, setMetaFormsLoading] = useState(false);
  const [metaFormSelected, setMetaFormSelected] = useState<string>("");
  const [activeFormsOnly, setActiveFormsOnly] = useState<boolean>(true);
  const [triggerNode, setTriggerNode] = useState<{ type: "facebook_form"; formId: string; formName: string } | null>(null);
  const [crmOpen, setCrmOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [followupOpen, setFollowupOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSub, setContactSub] = useState<null | "source" | "updated" | "tagged" | "birthday">(null);
  const [contactSources, setContactSources] = useState<string[]>([]);
  const [contactTags, setContactTags] = useState<string[]>([]);
  const [birthdayBefore, setBirthdayBefore] = useState("0");
  const [birthdayAt, setBirthdayAt] = useState("10:00");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarSub, setCalendarSub] = useState<null | "booked" | "cancelled" | "rescheduled" | "noshow" | "showup">(null);
  const [calendarSelection, setCalendarSelection] = useState<string>("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [igCommentOpen, setIgCommentOpen] = useState(false);
  const [igCommentFilter, setIgCommentFilter] = useState("Contains");
  const [igCommentContent, setIgCommentContent] = useState("");
  const [igDmOpen, setIgDmOpen] = useState(false);
  const [igDmFilter, setIgDmFilter] = useState("Contains");
  const [igDmContent, setIgDmContent] = useState("");
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionSearch, setActionSearch] = useState("");
  const [actionCategory, setActionCategory] = useState<string>("All");
  const [actionNodes, setActionNodes] = useState<Array<{ id: string; key: string; title: string; description: string; config?: any }>>([]);
  const [selectedNode, setSelectedNode] = useState<{ kind: "trigger" } | { kind: "action"; id: string } | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [actionsHydrated, setActionsHydrated] = useState(false);

  const deleteActionNode = (id: string) => {
    setActionNodes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNode((s) => (s?.kind === "action" && s.id === id ? null : s));
    toast({ title: "Action removed" });
  };

  const openEditActionNode = (node: { id: string; key: string; config?: any }) => {
    setEditingActionId(node.id);
    if (node.key === "add_update_crm") {
      setCrmPipeline(node.config?.pipeline || "Google Leads");
      setCrmStage(node.config?.stage || "New Leads");
      setCrmSkipValue(!!node.config?.skipLeadValueChange);
      setCrmLeadValue(String(node.config?.leadValue ?? "0"));
      setCrmConfigOpen(true);
    } else if (node.key === "whatsapp_message") {
      setWaSelectedName(node.config?.templateName || "");
      setWaVarValues(node.config?.variables || {});
      setWaConfigOpen(true);
      if (waTemplates.length === 0) fetchWaTemplates();
    } else if (node.key === "assign_staff") {
      setAssignStaffSelected(node.config?.staffId || "");
      setAssignStaffOnlyUnassigned(!!node.config?.onlyUnassigned);
      setAssignStaffOpen(true);
      if (staffList.length === 0) fetchStaffList();
    } else {
      setActionModalOpen(true);
    }
  };

  useEffect(() => {
    if (selectedNode?.kind === "action") {
      const n = actionNodes.find((x) => x.id === selectedNode.id);
      if (n?.key === "whatsapp_message" && waTemplates.length === 0 && !waTemplatesLoading) {
        fetchWaTemplates();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode]);

  // Auto-select existing trigger/first action on load so the preview panel
  // is visible by default without requiring an explicit click.
  useEffect(() => {
    if (selectedNode) return;
    if (triggerNode) {
      setSelectedNode({ kind: "trigger" });
    } else if (actionsHydrated && actionNodes.length > 0) {
      setSelectedNode({ kind: "action", id: actionNodes[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNode, actionsHydrated, actionNodes.length]);

  const [crmConfigOpen, setCrmConfigOpen] = useState(false);
  const [crmPipeline, setCrmPipeline] = useState("Google Leads");
  const [crmStage, setCrmStage] = useState("New Leads");
  const [crmSkipValue, setCrmSkipValue] = useState(false);
  const [crmLeadValue, setCrmLeadValue] = useState("0");

  // WhatsApp Message action config
  const [waConfigOpen, setWaConfigOpen] = useState(false);
  const [waTemplates, setWaTemplates] = useState<Array<{ name: string; language?: string; status?: string; body?: string; header_format?: string; header_text?: string; header_example?: string; footer_text?: string }>>([]);
  const [waTemplatesLoading, setWaTemplatesLoading] = useState(false);
  const [waSelectedName, setWaSelectedName] = useState("");
  const [waVarValues, setWaVarValues] = useState<Record<string, string>>({});
  const [waHeaderFile, setWaHeaderFile] = useState<File | null>(null);
  const [waShowPreview, setWaShowPreview] = useState(false);

  // Assign To Staff action config
  const [assignStaffOpen, setAssignStaffOpen] = useState(false);
  const [staffList, setStaffList] = useState<Array<{ id: string; full_name: string }>>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [assignStaffSelected, setAssignStaffSelected] = useState<string>("");
  const [assignStaffOnlyUnassigned, setAssignStaffOnlyUnassigned] = useState(false);

  const fetchStaffList = async () => {
    setStaffLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, active")
        .eq("active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      setStaffList((data || []).map((p: any) => ({ id: p.id, full_name: p.full_name || "Unknown" })));
    } catch (e: any) {
      toast({ title: "Could not load staff", description: e?.message || "Please try again", variant: "destructive" as any });
    } finally {
      setStaffLoading(false);
    }
  };

  const saveAssignStaffConfig = () => {
    if (!assignStaffSelected) {
      toast({ title: "Select a staff", description: "Please choose a staff member to assign." });
      return;
    }
    const staff = staffList.find((s) => s.id === assignStaffSelected);
    const config = {
      staffId: assignStaffSelected,
      staffName: staff?.full_name || "",
      onlyUnassigned: assignStaffOnlyUnassigned,
    };
    if (editingActionId) {
      setActionNodes((prev) => prev.map((n) => n.id === editingActionId ? { ...n, description: config.staffName, config } : n));
      setEditingActionId(null);
    } else {
      setActionNodes((prev) => [...prev, {
        id: `assign_staff-${Date.now()}`,
        key: "assign_staff",
        title: "Assign To Staff",
        description: config.staffName,
        config,
      }]);
    }
    setAssignStaffOpen(false);
    setAssignStaffSelected("");
    setAssignStaffOnlyUnassigned(false);
    toast({ title: "Action added", description: "Assign To Staff" });
  };

  const waSelectedTemplate = waTemplates.find((t) => t.name === waSelectedName);
  const waBodyText = waSelectedTemplate?.body || "";
  const waVarKeys = Array.from(
    new Set((waBodyText.match(/\{\{\s*(\d+)\s*\}\}/g) || []).map((m) => m.replace(/[^\d]/g, "")))
  ).sort((a, b) => Number(a) - Number(b));
  const waHeaderFormat = String(waSelectedTemplate?.header_format || "").toUpperCase();
  const waNeedsMedia = ["IMAGE", "VIDEO", "DOCUMENT"].includes(waHeaderFormat);

  const fetchWaTemplates = async () => {
    setWaTemplatesLoading(true);
    try {
      const authHeaders = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("whatsapp-list-templates", { body: {}, headers: authHeaders });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to load templates");
      const approved = (data.templates || []).filter(
        (t: any) => String(t.status || "").toUpperCase() === "APPROVED"
      );
      setWaTemplates(approved);
    } catch (e: any) {
      toast({ title: "Could not load templates", description: e?.message || "Please try again", variant: "destructive" as any });
    } finally {
      setWaTemplatesLoading(false);
    }
  };

  const renderWaPreview = () => {
    let text = waBodyText;
    waVarKeys.forEach((k) => {
      const v = waVarValues[k];
      if (v) text = text.split(`{{${k}}}`).join(v).split(`{{ ${k} }}`).join(v);
    });
    return text;
  };

  const saveWaConfig = () => {
    if (!waSelectedName) {
      toast({ title: "Select a template", description: "Please choose an approved template first." });
      return;
    }
    const config = {
      templateName: waSelectedName,
      language: waSelectedTemplate?.language || "en",
      variables: waVarValues,
      headerFileName: waHeaderFile?.name || null,
    };
    if (editingActionId) {
      setActionNodes((prev) => prev.map((n) => n.id === editingActionId ? { ...n, description: waSelectedName, config } : n));
      setEditingActionId(null);
    } else {
      setActionNodes((prev) => [...prev, {
        id: `whatsapp_message-${Date.now()}`,
        key: "whatsapp_message",
        title: "WhatsApp Message",
        description: waSelectedName,
        config,
      }]);
    }
    setWaConfigOpen(false);
    setWaSelectedName("");
    setWaVarValues({});
    setWaHeaderFile(null);
    setWaShowPreview(false);
    toast({ title: "Action added", description: "WhatsApp Message" });
  };
  const CRM_STAGES = [
    "New Leads",
    "Interesed",
    "Call Back",
    "Not Picking",
    "Not Reachable",
    "Partialy Looking",
    "Not Interested",
    "Appointment Booked",
    "Reschedule",
    "Diagnosed",
    "Treatment Done",
  ];
  const CRM_PIPELINES: Record<string, string[]> = {
    "Google Leads": CRM_STAGES,
    "Meta Ads": CRM_STAGES,
    "Offline Camp": CRM_STAGES,
    "Social media call leads": CRM_STAGES,
    "Walkin Lead": CRM_STAGES,
  };

  const ACTION_CATEGORIES = ["All", "Communication", "Conditions", "Operation", "Social", "External Apps", "Webhooks"];
  const ACTIONS: Array<{ key: string; title: string; description: string; category: string; icon: any }> = [
    { key: "add_update_crm", title: "Add/Update to CRM", description: "Add/Update Contact to CRM", category: "Operation", icon: ClipboardList },
    { key: "assign_ai", title: "Assign To AI Agent", description: "Assign To AI Agent", category: "Operation", icon: Bot },
    { key: "assign_staff", title: "Assign To Staff", description: "Assign To Staff", category: "Operation", icon: UserPlus },
    { key: "change_appt_status", title: "Change Appointment Status", description: "Update Appointment Status to any", category: "Operation", icon: CalendarCheck },
    { key: "change_lead_quality", title: "Change Lead Quality", description: "Change Lead Quality in CRM (Selected Pipeline)", category: "Operation", icon: Award },
    { key: "chat_group", title: "Chat Group", description: "Give group Access to Contact", category: "Social", icon: UsersRound },
    { key: "chat_group_revoke", title: "Chat Group Revoke", description: "Revoke group Access to Contact", category: "Social", icon: UsersRound },
    { key: "community_access", title: "Community Access", description: "Give access of Community to Contact", category: "Social", icon: Users },
    { key: "community_revoke", title: "Community Revoke", description: "Revoke Community Access from Contact", category: "Social", icon: Users },
    { key: "contact_group", title: "Contact Group", description: "Copy or move contact to another list. You can also delete contact from your list", category: "Operation", icon: ContactIcon },
    { key: "convert_lead", title: "Convert Lead to Customer", description: "Convert from lead to customer or vice versa", category: "Operation", icon: UserCheck },
    { key: "course_access", title: "Course Access", description: "Give course Access to Contact", category: "Operation", icon: BookOpen },
    { key: "course_revoke", title: "Course Revoke", description: "Revoke course Access to Contact", category: "Operation", icon: BookOpen },
    { key: "delay", title: "Delay", description: "Add a Delay time before proceeding with a next action. For example: send a series of email, but only one per day", category: "Conditions", icon: Timer },
    { key: "evaluate_condition", title: "Evaluate a condition", description: "Take actions when a condition is met. For example: a previous email is opened or clicked", category: "Conditions", icon: GitBranch },
    { key: "event_start", title: "Event Start Time", description: "Event/Webinar time when it start", category: "Conditions", icon: Clock },
    { key: "execute_automation", title: "Execute Automation", description: "Can run another automation workflow", category: "Operation", icon: PlayCircle },
    { key: "exit_workflow", title: "Exit Workflow", description: "Stop Execute the workflow", category: "Conditions", icon: LogOut },
    { key: "ig_dm_reply", title: "Instagram DM Reply", description: "Reply to an Instagram direct message automatically", category: "Social", icon: Instagram },
    { key: "internal_notification", title: "Internal Notification", description: "Send an Internal Notification", category: "Communication", icon: Bell },
    { key: "meta_capi", title: "Meta CAPI", description: "Meta CAPI", category: "External Apps", icon: Shuffle },
    { key: "remove_assigned_staff", title: "Remove Assigned Staff", description: "Remove Assigned Staff", category: "Operation", icon: UserMinus },
    { key: "remove_contact", title: "Remove contact", description: "Remove contact to selected list", category: "Operation", icon: Trash2 },
    { key: "remove_from_crm", title: "Remove from CRM", description: "Remove Contact from CRM", category: "Operation", icon: Trash2 },
    { key: "remove_tag", title: "Remove Tag", description: "Remove one or more tags to your contact.", category: "Operation", icon: Tag },
    { key: "remove_workflow", title: "Remove Workflow", description: "Remove a contact from the current workflow", category: "Operation", icon: X },
    { key: "reply_ig_comment", title: "Reply to Instagram Comment", description: "Reply to an Instagram comment automatically", category: "Social", icon: Instagram },
    { key: "send_email", title: "Send Email", description: "Send an automated email", category: "Communication", icon: Mail },
    { key: "send_ig_dm", title: "Send Instagram DM (Apply only for Comments)", description: "Send a direct message to the contact via Instagram", category: "Social", icon: Instagram },
    { key: "send_sms", title: "Send SMS", description: "Send an automated SMS", category: "Communication", icon: MessageSquare },
    { key: "tag_contact", title: "Tag contact", description: "Assign one or more tags to your contact. Later you can filter your contacts by tag", category: "Operation", icon: Tag },
    { key: "update_attributes", title: "Update contact's attributes", description: "Update contact's attributes like: first name, last name,... or any custom field your contact has", category: "Operation", icon: UserCog },
    { key: "webhook", title: "Webhook", description: "Fire a webhook containing the contact's details", category: "Webhooks", icon: Webhook },
    { key: "webhook_advance", title: "Webhook Advance", description: "Send data to external systems with advanced configuration options", category: "Webhooks", icon: Webhook },
    { key: "whatsapp_message", title: "WhatsApp Message", description: "Send a automated whatsapp message", category: "Communication", icon: MessageCircle },
  ];

  const filteredActions = ACTIONS.filter((a) => {
    const matchesCategory = actionCategory === "All" || a.category === actionCategory;
    const matchesSearch = !actionSearch || a.title.toLowerCase().includes(actionSearch.toLowerCase()) || a.description.toLowerCase().includes(actionSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleSelectAction = (a: typeof ACTIONS[number]) => {
    if (a.key === "add_update_crm") {
      setActionModalOpen(false);
      setCrmPipeline("Google Leads");
      setCrmStage("New Leads");
      setCrmSkipValue(false);
      setCrmLeadValue("0");
      setCrmConfigOpen(true);
      return;
    }
    if (a.key === "whatsapp_message") {
      setActionModalOpen(false);
      setWaSelectedName("");
      setWaVarValues({});
      setWaHeaderFile(null);
      setWaShowPreview(false);
      setWaConfigOpen(true);
      if (waTemplates.length === 0) fetchWaTemplates();
      return;
    }
    if (a.key === "assign_staff") {
      setActionModalOpen(false);
      setAssignStaffSelected("");
      setAssignStaffOnlyUnassigned(false);
      setAssignStaffOpen(true);
      if (staffList.length === 0) fetchStaffList();
      return;
    }
    setActionNodes((prev) => [...prev, { id: `${a.key}-${Date.now()}`, key: a.key, title: a.title, description: a.description }]);
    setActionModalOpen(false);
    setActionSearch("");
    setActionCategory("All");
    toast({ title: "Action added", description: a.title });
  };

  const saveCrmConfig = () => {
    const config = {
      pipeline: crmPipeline,
      stage: crmStage,
      skipLeadValueChange: crmSkipValue,
      leadValue: Number(crmLeadValue) || 0,
    };
    if (editingActionId) {
      setActionNodes((prev) => prev.map((n) => n.id === editingActionId ? { ...n, description: `${config.pipeline} • ${config.stage}`, config } : n));
      setEditingActionId(null);
    } else {
      setActionNodes((prev) => [...prev, {
        id: `add_update_crm-${Date.now()}`,
        key: "add_update_crm",
        title: "Add/Update to CRM",
        description: `${config.pipeline} • ${config.stage}`,
        config,
      }]);
    }
    setCrmConfigOpen(false);
    toast({ title: "Action added", description: "Add/Update to CRM" });
  };


  const fetchMetaForms = async () => {
    setMetaFormsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-ads", {
        body: { action: "list_lead_forms" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      const forms = (data?.forms || []) as Array<{ id: string; name: string; status?: string }>;
      setMetaForms(forms);
      if (forms.length === 0) {
        toast({ title: "No forms found", description: "This Facebook Page has no lead forms yet." });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch forms";
      console.error("meta lead forms fetch failed:", msg);
      toast({ title: "Unable to load forms", description: msg, variant: "destructive" });
      setMetaForms([]);
    } finally {
      setMetaFormsLoading(false);
    }
  };

  useEffect(() => {
    if (metaFormOpen && metaForms.length === 0 && !metaFormsLoading) {
      fetchMetaForms();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaFormOpen]);

  // Load workflow from DB when editing an existing one
  useEffect(() => {
    if (!workflowId) { setActionsHydrated(true); return; }
    (async () => {
      setLoadingWorkflow(true);
      const { data, error } = await supabase
        .from("workflows")
        .select("id,name,meta_form_id,status,reentry,updated_at,config")
        .eq("id", workflowId)
        .maybeSingle();
      if (error) {
        toast({ title: "Failed to load workflow", description: error.message, variant: "destructive" });
      } else if (data) {
        setName(data.name || "Untitled Automation");
        setPaused(!data.status);
        setAllowReentry(!!data.reentry);
        setMetaFormSelected(data.meta_form_id || "");
        if (data.meta_form_id) {
          setTriggerNode({ type: "facebook_form", formId: data.meta_form_id, formName: "" });
        }
        const savedNodes = (data.config as any)?.action_nodes;
        if (Array.isArray(savedNodes)) setActionNodes(savedNodes);
        setLastSavedAt(data.updated_at ? new Date(data.updated_at) : null);
      }
      setLoadingWorkflow(false);
      setActionsHydrated(true);
    })();
  }, [workflowId]);

  // Persist action nodes sequence to Supabase (debounced)
  useEffect(() => {
    if (!workflowId || loadingWorkflow || !actionsHydrated) return;
    const t = setTimeout(async () => {
      const { data: current } = await supabase
        .from("workflows")
        .select("config")
        .eq("id", workflowId)
        .maybeSingle();
      const nextConfig = { ...((current?.config as any) || {}), action_nodes: actionNodes };
      const { error } = await supabase
        .from("workflows")
        .update({ config: nextConfig })
        .eq("id", workflowId);
      if (!error) setLastSavedAt(new Date());
    }, 600);
    return () => clearTimeout(t);
  }, [actionNodes, workflowId, loadingWorkflow, actionsHydrated]);

  // Persist name/status/reentry when they change (only for existing workflows)
  useEffect(() => {
    if (!workflowId || loadingWorkflow) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("workflows")
        .update({ name, status: !paused, reentry: allowReentry })
        .eq("id", workflowId);
      if (!error) setLastSavedAt(new Date());
    }, 500);
    return () => clearTimeout(t);
  }, [name, paused, allowReentry, workflowId, loadingWorkflow]);

  const handleSaveAndExit = async () => {
    try {
      if (!workflowId) {
        const { data, error } = await supabase
          .from("workflows")
          .insert({
            name,
            status: !paused,
            reentry: allowReentry,
            config: { action_nodes: actionNodes },
          })
          .select("id")
          .single();
        if (error || !data) {
          toast({ title: "Save failed", description: error?.message || "Could not save workflow", variant: "destructive" });
          return;
        }
      } else {
        const { data: current } = await supabase
          .from("workflows")
          .select("config")
          .eq("id", workflowId)
          .maybeSingle();
        const nextConfig = { ...((current?.config as any) || {}), action_nodes: actionNodes };
        const { error } = await supabase
          .from("workflows")
          .update({ name, status: !paused, reentry: allowReentry, config: nextConfig })
          .eq("id", workflowId);
        if (error) {
          toast({ title: "Save failed", description: error.message, variant: "destructive" });
          return;
        }
      }
      toast({ title: "Workflow saved" });
      navigate("/automation-workflow");
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message || "Unexpected error", variant: "destructive" });
    }
  };

  const saveMetaFormMapping = async () => {
    if (!metaFormSelected) {

      toast({ title: "Select a form", description: "Pick a Facebook lead form to map.", variant: "destructive" });
      return;
    }
    const chosen = metaForms.find((f) => f.id === metaFormSelected);
    const formName = chosen?.name || "Meta Form";

    // Update canvas state so "+ Add New Trigger" becomes the Facebook Trigger Node
    setTriggerNode({ type: "facebook_form", formId: metaFormSelected, formName });
    setFormsOpen(false);
    setMetaFormOpen(false);
    setTriggerOpen(false);

    setSavingForm(true);
    try {
      if (!workflowId) {
        // Create a new workflow row and persist the mapping in one shot
        const { data, error } = await supabase
          .from("workflows")
          .insert({
            name,
            subtitle: `Meta Form: ${formName}`,
            meta_form_id: metaFormSelected,
            status: !paused,
            reentry: allowReentry,
          })
          .select("id")
          .single();
        if (error || !data) {
          toast({ title: "Save failed", description: error?.message || "Could not create workflow", variant: "destructive" });
          return;
        }
        setLastSavedAt(new Date());
        toast({ title: "Meta form mapped", description: formName });
        navigate(`/automation-workflow/edit/${data.id}`, { replace: true });
        return;
      }

      const { error } = await supabase
        .from("workflows")
        .update({ meta_form_id: metaFormSelected, subtitle: `Meta Form: ${formName}` })
        .eq("id", workflowId);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      setLastSavedAt(new Date());
      toast({ title: "Meta form mapped", description: formName });
    } finally {
      setSavingForm(false);
    }
  };

  const relSaved = (() => {
    if (!lastSavedAt) return null;
    const s = Math.max(1, Math.floor((Date.now() - lastSavedAt.getTime()) / 1000));
    if (s < 60) return `${s} second${s === 1 ? "" : "s"} ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
    const h = Math.floor(m / 60);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  })();



  const sourceOptions = [
    { id: "bulk-import", label: "Bulk Import" },
    { id: "pabbly", label: "Pabbly" },
    { id: "live-chat", label: "Live Chat" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "whatsapp-official", label: "WhatsApp Official" },
    { id: "instagram", label: "Instagram" },
    { id: "manual", label: "Manual" },
  ];
  const tagOptions = ["Consultation", "Extraction", "Filling", "Flap Surgery", "Impaction", "Implant"];
  const birthdayBeforeOptions = [
    { v: "0", l: "0 day (on the same day)" },
    { v: "1", l: "1 day" }, { v: "2", l: "2 days" }, { v: "3", l: "3 days" },
    { v: "4", l: "4 days" }, { v: "5", l: "5 days" }, { v: "6", l: "6 days" },
    { v: "7", l: "1 week" }, { v: "14", l: "2 weeks" }, { v: "30", l: "1 month" }, { v: "60", l: "2 months" },
  ];

  const triggerOptions = [
    { id: "forms", label: "Forms", icon: ClipboardList },
    { id: "crm", label: "CRM", icon: MonitorCog },
    { id: "contact", label: "Contact", icon: UserPlus },
    { id: "calendar", label: "Calendar", icon: CalendarClock },
    { id: "comments", label: "Comments/DM", icon: MessageCircle },
  ];

  if (view === "logs") {
    return (
      <div className="min-h-screen bg-slate-50 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-8 rounded-full bg-emerald-500" />
          <h1 className="text-base font-semibold text-slate-800">
            {name}
          </h1>
        </div>
        <div className="rounded-lg border border-border bg-white p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="inline-block h-2 w-8 rounded-full bg-emerald-500" />
              <h2 className="font-semibold text-slate-800">Logs (0)</h2>
            </div>
            <Button variant="outline" className="gap-2 h-9">
              <Calendar size={14} /> July 15, 2026 - July 16, 2026
              <ChevronDown size={14} />
            </Button>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                placeholder="Search by contact"
                className="pl-8 h-9 w-56"
              />
            </div>
            <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold tracking-wide">
              FILTER
            </Button>
            <Button
              size="icon"
              className="h-9 w-9 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              onClick={() => setView("editor")}
              className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold tracking-wide"
            >
              EDIT AUTOMATION
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {[
              { id: "all", label: "All", count: 0, icon: List, color: "emerald" },
              {
                id: "completed",
                label: "Completed",
                count: 0,
                icon: CheckCircle2,
                color: "slate",
              },
              {
                id: "pending",
                label: "Pending",
                count: 0,
                icon: Hourglass,
                color: "amber",
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setLogsTab(t.id as typeof logsTab)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition",
                  logsTab === t.id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-600"
                )}
              >
                <t.icon size={12} />
                {t.label} <span className="font-bold">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="rounded-md border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-slate-200">
                <tr>
                  <th className="w-10 p-3">
                    <Checkbox />
                  </th>
                  <th className="p-3 text-left font-semibold text-slate-700">
                    Contact
                  </th>
                  <th className="p-3 text-left font-semibold text-slate-700">
                    Completed Action / Time
                  </th>
                  <th className="p-3 text-left font-semibold text-slate-700">
                    Next Action
                  </th>
                  <th className="p-3 text-left font-semibold text-slate-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-slate-50">
                  <td colSpan={5} className="p-4 text-center text-slate-500 font-medium">
                    No enrollments yet
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Select defaultValue="10">
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 left-[var(--sidebar-width,0px)] flex flex-col bg-white z-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate("/automation-workflow")}
            className="p-1 hover:bg-slate-100 rounded shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          {editingName ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              className="w-64 h-8 font-semibold"
            />
          ) : (
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="text-base font-semibold text-slate-800 truncate">
                {name}
              </h1>
              <button
                onClick={() => setEditingName(true)}
                className="p-1 hover:bg-slate-100 rounded shrink-0"
                aria-label="Rename"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <div className="hidden md:flex items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-700 border border-sky-100 shrink-0">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
            {workflowId ? (relSaved ? `Last saved: ${relSaved}` : "Not saved yet") : "New workflow — not saved"}
          </div>
        </div>


        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 mr-2 pr-2 border-r border-slate-200">
            <Switch
              checked={!paused}
              onCheckedChange={(v) => setPaused(!v)}
              className="data-[state=checked]:bg-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-700">
              {paused ? "Paused" : "Active"}
            </span>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-md">
            <ChevronDown size={16} />
          </Button>

          <Button className="h-9 rounded-md bg-slate-700 hover:bg-slate-800 text-white gap-2">
            <Monitor size={14} /> Test Workflow
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 rounded-md bg-orange-500 hover:bg-orange-600 text-white gap-2">
                <MenuIcon size={14} /> Menu <ChevronDown size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setView("logs")} className="gap-2">
                <List size={14} /> Logs
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <SettingsIcon size={14} /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setVersionOpen(true)}
                className="gap-2"
              >
                <History size={14} /> Version History
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Canvas */}
        <div
          className="relative flex-1 bg-slate-100"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedNode(null); }}
          style={{
            backgroundImage:
              "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        >
          {/* Trigger node */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
            {triggerNode?.type === "facebook_form" ? (
              <div className="relative group">
                <button
                  onClick={() => { setSelectedNode({ kind: "trigger" }); }}
                  className={`rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 shadow-md flex items-center gap-2 min-w-[220px] ${selectedNode?.kind === "trigger" ? "ring-2 ring-indigo-300" : ""}`}
                  title="View trigger"
                >
                  <InfinityIcon size={14} />
                  <span className="truncate">Facebook Forms</span>
                </button>
                {selectedNode?.kind === "trigger" && (
                  <div
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-20 flex items-center gap-1 bg-white rounded-md shadow-lg border border-slate-200 px-1 py-1"
                    style={{ pointerEvents: "auto" }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setTriggerOpen(true); }}
                      className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100"
                      title="Edit trigger"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setTriggerNode(null); setSelectedNode(null); toast({ title: "Trigger removed" }); }}
                      className="h-7 w-7 rounded flex items-center justify-center text-red-500 hover:bg-red-50"
                      title="Delete trigger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setTriggerOpen(true)}
                className="rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 shadow-md flex items-center gap-1"
              >
                <Plus size={14} /> Add New Trigger
              </button>
            )}
            {actionNodes.map((node) => {
              const def = ACTIONS.find((a) => a.key === node.key);
              const Icon = def?.icon || ClipboardList;
              const isCrm = node.key === "add_update_crm";
              const isSelected = selectedNode?.kind === "action" && selectedNode.id === node.id;
              const bg = isCrm
                ? "bg-purple-500 hover:bg-purple-600"
                : "bg-emerald-500 hover:bg-emerald-600";
              const label = isCrm ? "Add/Update to CRM" : `Action: ${node.title}`;
              return (
                <div key={node.id} className="flex flex-col items-center">
                  <div className="h-6 w-px bg-slate-400" />
                  <div className="relative group">
                    <button
                      onClick={() => setSelectedNode({ kind: "action", id: node.id })}
                      className={`rounded-md ${bg} text-white text-sm font-medium px-4 py-2 shadow-md flex items-center gap-2 min-w-[220px] ${isSelected ? "ring-2 ring-offset-1 ring-slate-300" : ""}`}
                      title="View action"
                    >
                      <Icon size={14} />
                      <span className="truncate">{label}</span>
                    </button>
                    {isSelected && (
                      <div
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-20 flex items-center gap-1 bg-white rounded-md shadow-lg border border-slate-200 px-1 py-1"
                        style={{ pointerEvents: "auto" }}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditActionNode(node); }}
                          className="h-7 w-7 rounded flex items-center justify-center text-slate-600 hover:bg-slate-100"
                          title="Edit action"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteActionNode(node.id); }}
                          className="h-7 w-7 rounded flex items-center justify-center text-red-500 hover:bg-red-50"
                          title="Delete action"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="h-6 w-px bg-slate-400" />
            <button
              onClick={() => setActionModalOpen(true)}
              className="h-6 w-6 rounded-full border-2 border-slate-400 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700"
              title="Add action"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Floating toolbar */}
          <div className="absolute bottom-16 left-4 flex flex-col rounded-md border border-slate-300 bg-white shadow-sm overflow-hidden">
            {[
              { id: "zoom-in", icon: Plus },
              { id: "zoom-out", icon: Minus },
              { id: "lock", icon: Lock },
              { id: "center", icon: Maximize2 },
              { id: "layers", icon: Layers },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "h-9 w-9 flex items-center justify-center border-b border-slate-200 last:border-b-0 hover:bg-slate-50",
                  activeTool === t.id && "bg-amber-100 text-amber-700"
                )}
              >
                <t.icon size={16} />
              </button>
            ))}
          </div>

          {/* Report button */}
          <button className="absolute bottom-4 left-4 flex items-center gap-1 rounded-md bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-3 py-1.5 shadow">
            <FileText size={14} /> Report
          </button>
        </div>

        {/* Right panel */}
        {selectedNode ? (
          <aside className="w-[380px] border-l border-border bg-white overflow-y-auto p-5 space-y-4">
            <button
              onClick={() => setSelectedNode(null)}
              className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
            >
              <ChevronLeft size={16} /> Back to automation
            </button>
            {selectedNode.kind === "trigger" ? (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Facebook Forms</h2>
                  <p className="text-sm text-slate-500 mt-1">Trigger when a lead submits your Meta Form</p>
                </div>
                {triggerNode?.type === "facebook_form" ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm">
                    <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Page</span><span className="font-medium text-slate-900">Dr Neemz Dentistry</span></div>
                    <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Form</span><span className="font-medium text-slate-900 text-right ml-2 truncate max-w-[200px]">{triggerNode.formName}</span></div>
                    <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Trigger</span><span className="font-medium text-slate-900">New Submission</span></div>
                    <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Status</span><span className={`font-medium ${paused ? "text-amber-600" : "text-emerald-600"}`}>{paused ? "Paused" : "Active"}</span></div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                    <p className="text-sm text-slate-600 mb-2">Configuration not completed.</p>
                    <Button size="sm" onClick={() => setTriggerOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white">Configure</Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => { setTriggerOpen(true); setFormsOpen(true); setMetaFormOpen(true); }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => { setTriggerOpen(true); }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    Change operation
                  </Button>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-4 flex gap-3">
                  <div className="h-9 w-9 rounded-md bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                    <Trash2 size={18} />
                  </div>
                  <div className="space-y-2">
                    <div className="font-semibold text-sm text-slate-900">Delete this trigger</div>
                    <p className="text-xs text-slate-600">
                      Click to completely remove this trigger. This action cannot be undone
                    </p>
                    <Button
                      onClick={() => { setTriggerNode(null); setSelectedNode(null); }}
                      className="bg-red-500 hover:bg-red-600 text-white gap-1"
                      size="sm"
                    >
                      <Trash2 size={14} /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ) : (() => {
              const node = actionNodes.find((n) => n.id === selectedNode.id);
              if (!node) return null;
              const isCrm = node.key === "add_update_crm";
              const isWa = node.key === "whatsapp_message";
              const subtitle = isCrm
                ? "Add/Update Contact to CRM"
                : isWa
                  ? "Send a WhatsApp template message"
                  : node.description || "";
              const details = isCrm
                ? `${node.config?.pipeline || "-"} >> ${node.config?.stage || "-"}`
                : isWa
                  ? `Template: ${node.config?.templateName || node.description}`
                  : node.description;
              const waTpl = isWa ? waTemplates.find((t) => t.name === node.config?.templateName) : null;
              const waVars: Record<string, string> = (node.config?.variables || {}) as any;
              let waPreviewText = waTpl?.body || "";
              if (waTpl?.body) {
                Object.entries(waVars).forEach(([k, v]) => {
                  if (v) waPreviewText = waPreviewText.split(`{{${k}}}`).join(String(v)).split(`{{ ${k} }}`).join(String(v));
                });
              }
              return (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{node.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
                  </div>
                  {isCrm ? (
                    node.config?.pipeline ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-200 text-sm">
                        <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Pipeline</span><span className="font-medium text-slate-900">{node.config?.pipeline}</span></div>
                        <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Stage</span><span className="font-medium text-slate-900">{node.config?.stage || "-"}</span></div>
                        <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Skip Lead Value</span><span className="font-medium text-slate-900">{node.config?.skipLeadValue ? "Yes" : "No"}</span></div>
                        <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Lead Value</span><span className="font-medium text-slate-900">{String(node.config?.leadValue ?? "0")}</span></div>
                        <div className="flex justify-between px-3 py-2"><span className="text-slate-500">Operation</span><span className="font-medium text-slate-900">Add/Update Contact</span></div>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
                        <p className="text-sm text-slate-600 mb-2">Configuration not completed.</p>
                        <Button size="sm" onClick={() => { setCrmPipeline("Google Leads"); setCrmStage("New Leads"); setCrmSkipValue(false); setCrmLeadValue("0"); setCrmConfigOpen(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white">Configure</Button>
                      </div>
                    )
                  ) : (
                    <div className="text-sm font-semibold text-slate-800">{details}</div>
                  )}
                  {isWa && (
                    <div className="rounded-lg bg-slate-100 p-4">
                      {!waTpl ? (
                        <div className="text-xs text-slate-500 text-center py-4">Loading template preview…</div>
                      ) : (
                        <div className="bg-white rounded-lg shadow-sm p-3 space-y-2">
                          {waTpl.header_text && (
                            <div className="font-semibold text-sm text-slate-900">{waTpl.header_text}</div>
                          )}
                          {["IMAGE", "VIDEO", "DOCUMENT"].includes(String(waTpl.header_format || "").toUpperCase()) && (
                            <div className="rounded-md bg-slate-100 h-24 flex items-center justify-center text-slate-400 text-xs">
                              {String(waTpl.header_format).toUpperCase()} header
                            </div>
                          )}
                          <div className="text-sm text-slate-800 whitespace-pre-wrap">{waPreviewText}</div>
                          {waTpl.footer_text && (
                            <div className="text-xs text-slate-500 pt-1">{waTpl.footer_text}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        if (isCrm) {
                          setCrmPipeline(node.config?.pipeline || "Google Leads");
                          setCrmStage(node.config?.stage || "New Leads");
                          setCrmSkipValue(!!node.config?.skipLeadValue);
                          setCrmLeadValue(String(node.config?.leadValue ?? "0"));
                          setCrmConfigOpen(true);
                        } else if (isWa) {
                          setWaSelectedName(node.config?.templateName || "");
                          setWaVarValues(node.config?.variables || {});
                          setWaConfigOpen(true);
                          if (waTemplates.length === 0) fetchWaTemplates();
                        } else {
                          setActionModalOpen(true);
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => setActionModalOpen(true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      Change operation
                    </Button>
                  </div>
                  <div className="rounded-md border border-red-200 bg-red-50 p-4 flex gap-3">
                    <div className="h-9 w-9 rounded-md bg-red-100 flex items-center justify-center text-red-500 shrink-0">
                      <Trash2 size={18} />
                    </div>
                    <div className="space-y-2">
                      <div className="font-semibold text-sm text-slate-900">Delete this action</div>
                      <p className="text-xs text-slate-600">
                        Click to completely delete this automation along with its data. This action cannot be undone
                      </p>
                      <Button
                        onClick={() => {
                          setActionNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
                          setSelectedNode(null);
                        }}
                        className="bg-red-500 hover:bg-red-600 text-white gap-1"
                        size="sm"
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </aside>
        ) : (
        <aside className="w-[380px] border-l border-border bg-white overflow-y-auto p-5 space-y-4">

          <h2 className="text-red-500 font-semibold text-sm">Trigger Not Set</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Below is general information of the automation. You can update the
            settings and click <code className="text-[11px]">`Save`</code>{" "}
            button.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Schedule Enable</Label>
            <Input
              type="datetime-local"
              value={scheduleEnable}
              onChange={(e) => setScheduleEnable(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">
              Schedule Disable{" "}
              <span className="font-normal text-slate-500 text-xs">
                (if date not selected then it will not disable automatically)
              </span>
            </Label>
            <Input
              type="datetime-local"
              value={scheduleDisable}
              onChange={(e) => setScheduleDisable(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold">Allow Re-entry</Label>
            <Switch
              checked={allowReentry}
              onCheckedChange={setAllowReentry}
              className="data-[state=checked]:bg-emerald-600"
            />
            <Info size={14} className="text-slate-400" />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-sm font-semibold bg-indigo-100 px-1 rounded">
              Specific Time
            </Label>
            <Switch
              checked={specificTime}
              onCheckedChange={setSpecificTime}
              className="data-[state=checked]:bg-emerald-600"
            />
            <Info size={14} className="text-slate-400" />
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveAndExit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6">
              Save
            </Button>

          </div>
        </aside>
        )}
      </div>

      <Dialog open={versionOpen} onOpenChange={setVersionOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Version History
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 py-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Version Name</Label>
                <Input
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g., Before major change"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Description (optional)
                </Label>
                <Textarea
                  value={versionDesc}
                  onChange={(e) => setVersionDesc(e.target.value)}
                  placeholder="Short notes"
                  rows={3}
                />
              </div>
              <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Save size={14} /> Save Version
              </Button>
              <div>
                <h3 className="font-semibold text-sm mb-2">All Versions</h3>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  No versions yet. Manual saves appear here. Auto-saves keep
                  the latest 4.
                </div>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 min-h-[300px] text-sm text-slate-500">
              Select a version to preview its details.
            </div>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button
              onClick={() => setVersionOpen(false)}
              className="rounded-md bg-slate-500 hover:bg-slate-600 text-white px-6"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triggerOpen} onOpenChange={setTriggerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Trigger</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-2">
            {triggerOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  const next = opt.id;
                  setTriggerOpen(false);
                  setTimeout(() => {
                    if (next === "forms") setFormsOpen(true);
                    else if (next === "crm") setCrmOpen(true);
                    else if (next === "contact") setContactOpen(true);
                    else if (next === "calendar") setCalendarOpen(true);
                    else if (next === "comments") setCommentsOpen(true);
                  }, 120);
                }}
                className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
              >
                <opt.icon size={32} className="text-slate-700" strokeWidth={1.5} />
                <span className="text-sm font-medium text-slate-700">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={commentsOpen} onOpenChange={(o) => { setCommentsOpen(o); if (!o) { setIgCommentOpen(false); setIgDmOpen(false); } }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {!igCommentOpen && !igDmOpen ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-xl font-semibold">Comments/DM</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 pt-2">
                {[
                  { id: "ig-comment", label: "Instagram Comment", icon: MessageCircle },
                  { id: "ig-dm", label: "Instagram DM", icon: MessageCircle },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      if (o.id === "ig-comment") setIgCommentOpen(true);
                      else if (o.id === "ig-dm") setIgDmOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
                  >
                    <o.icon size={32} className="text-slate-700" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-slate-700 text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : igCommentOpen ? (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button
                  onClick={() => setIgCommentOpen(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => { setIgCommentOpen(false); setCommentsOpen(false); }}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Instagram Comment</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Select a specific Instagram post/reel/ad or filter by pages to automate responses to Instagram comments
                  </p>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50/50 px-6 py-8 text-center text-sm text-slate-500">
                  No Instagram posts were found. Please make sure your Instagram account is connected and has posts.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-700">
                      Comment Filter Type <span className="text-red-500">*</span>
                    </Label>
                    <select
                      value={igCommentFilter}
                      onChange={(e) => setIgCommentFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="Any">Any</option>
                      <option value="Contains">Contains</option>
                      <option value="Exact match">Exact match</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-700">
                      Comment Content <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={igCommentContent}
                      onChange={(e) => setIgCommentContent(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => { setIgCommentOpen(false); setCommentsOpen(false); }}
                    className="bg-green-500 hover:bg-green-600 text-white h-10 px-6"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button
                  onClick={() => setIgDmOpen(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => { setIgDmOpen(false); setCommentsOpen(false); }}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Instagram DM</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Trigger will fire when a direct message matching your filter criteria is received on Instagram.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-700">
                      Message Filter Type <span className="text-red-500">*</span>
                    </Label>
                    <select
                      value={igDmFilter}
                      onChange={(e) => setIgDmFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="Any">Any</option>
                      <option value="Contains">Contains</option>
                      <option value="Exact match">Exact match</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-700">
                      Message Content <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={igDmContent}
                      onChange={(e) => setIgDmContent(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    onClick={() => { setIgDmOpen(false); setCommentsOpen(false); }}
                    className="bg-green-500 hover:bg-green-600 text-white h-10 px-6"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>





      <Dialog open={crmOpen} onOpenChange={(o) => { setCrmOpen(o); if (!o) { setPipelineOpen(false); setStageOpen(false); setFollowupOpen(false); setNotesOpen(false); } }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {!pipelineOpen && !stageOpen && !followupOpen && !notesOpen ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-xl font-semibold">CRM</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 pt-2">
                {[
                  { id: "pipeline", label: "Added to Pipeline", icon: Network },
                  { id: "stage", label: "Stage Changed", icon: Repeat },
                  { id: "followup", label: "Follow Up", icon: HistoryIcon },
                  { id: "notes", label: "Notes Added", icon: FilePlus },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => {
                      if (o.id === "pipeline") setPipelineOpen(true);
                      else if (o.id === "stage") setStageOpen(true);
                      else if (o.id === "followup") setFollowupOpen(true);
                      else if (o.id === "notes") setNotesOpen(true);
                      else setCrmOpen(false);
                    }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
                  >
                    <o.icon size={32} className="text-slate-700" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-slate-700 text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button onClick={() => { setPipelineOpen(false); setStageOpen(false); setFollowupOpen(false); setNotesOpen(false); }} className="p-1 hover:bg-slate-100 rounded" aria-label="Back">
                  <ArrowLeft size={18} />
                </button>
                <button onClick={() => { setCrmOpen(false); setPipelineOpen(false); setStageOpen(false); setFollowupOpen(false); setNotesOpen(false); }} className="p-1 hover:bg-slate-100 rounded" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {notesOpen ? "Note Added" : followupOpen ? "Follow Up" : stageOpen ? "Stage Changed" : "Added to Pipeline"}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {notesOpen
                      ? "When a note added to contact automation will trigger"
                      : followupOpen
                      ? "When a followup has changes automation will trigger"
                      : stageOpen
                      ? "When a contact's stage is changed in selected pipeline automation will trigger"
                      : "When a contact is added to selected pipeline automation will trigger"}
                  </p>
                </div>

                {followupOpen && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Select When Follow Up Changed To</Label>
                    <Select>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(pipelineOpen || stageOpen) && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Select Pipeline</Label>
                      <Select defaultValue="google-leads">
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google-leads">Google Leads</SelectItem>
                          <SelectItem value="meta-ads">Meta Ads</SelectItem>
                          <SelectItem value="offline-camp">Offline Camp</SelectItem>
                          <SelectItem value="social-media">Social media call leads</SelectItem>
                          <SelectItem value="walkin">Walkin Lead</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Select Pipeline Stage</Label>
                      <Select defaultValue={stageOpen ? "new-leads" : "any"}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {!stageOpen && <SelectItem value="any">Any Stage</SelectItem>}
                          <SelectItem value="new-leads">New Leads</SelectItem>
                          <SelectItem value="interesed">Interesed</SelectItem>
                          <SelectItem value="call-back">Call Back</SelectItem>
                          <SelectItem value="not-picking">Not Picking</SelectItem>
                          <SelectItem value="not-reachable">Not Reachable</SelectItem>
                          <SelectItem value="partialy-looking">Partialy Looking</SelectItem>
                          <SelectItem value="not-interested">Not Interested</SelectItem>
                          <SelectItem value="appointment-booked">Appointment Booked</SelectItem>
                          <SelectItem value="reschedule">Reschedule</SelectItem>
                          <SelectItem value="diagnosed">Diagnosed</SelectItem>
                          <SelectItem value="treatment-done">Treatment Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div>
                  <Button onClick={() => { setCrmOpen(false); setPipelineOpen(false); setStageOpen(false); setFollowupOpen(false); setNotesOpen(false); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6">
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>



      <Dialog open={formsOpen} onOpenChange={(o) => { setFormsOpen(o); if (!o) setMetaFormOpen(false); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {!metaFormOpen ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-xl font-semibold">Forms</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-6 pt-2">
                <button
                  onClick={() => setMetaFormOpen(true)}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
                >
                  <InfinityIcon size={32} className="text-slate-700" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">Meta Form</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button
                  onClick={() => setMetaFormOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded"
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => { setFormsOpen(false); setMetaFormOpen(false); }}
                  className="p-1 hover:bg-slate-100 rounded"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Facebook Forms</h2>
                  <p className="text-sm text-slate-600 mt-1">Select the form which you need to automate</p>
                </div>

                <div className="flex items-center gap-2">
                  <InfinityIcon size={20} className="text-slate-900" strokeWidth={2} />
                  <span className="text-sm font-semibold text-slate-900">Meta Form</span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">
                    Facebook Page <span className="text-red-500">*</span>
                  </Label>
                  <Select defaultValue="dr-neemz">
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dr-neemz">Dr Neemz Dentistry</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Info size={12} /> Only pages connected through the App Store are available for selection.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Form</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="active-forms-only" className="text-xs text-slate-600 cursor-pointer">
                        Active Forms Only
                      </Label>
                      <Switch
                        id="active-forms-only"
                        checked={activeFormsOnly}
                        onCheckedChange={setActiveFormsOnly}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={metaFormSelected} onValueChange={setMetaFormSelected} disabled={metaFormsLoading}>
                      <SelectTrigger className="h-10 flex-1">
                        <SelectValue placeholder={metaFormsLoading ? "Loading forms..." : "Select Forms"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const visible = metaForms.filter((f) =>
                            activeFormsOnly ? (f.status ? f.status === "ACTIVE" : true) : true
                          );
                          // Always keep the currently selected form visible for backward compatibility
                          if (metaFormSelected && !visible.some((f) => f.id === metaFormSelected)) {
                            const sel = metaForms.find((f) => f.id === metaFormSelected);
                            if (sel) visible.unshift(sel);
                          }
                          if (visible.length === 0) {
                            return (
                              <SelectItem value="none" disabled>
                                {activeFormsOnly ? "No active forms available" : "No forms available"}
                              </SelectItem>
                            );
                          }
                          return visible.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.name}{f.status && f.status !== "ACTIVE" ? ` (${f.status})` : ""}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fetchMetaForms}
                      disabled={metaFormsLoading}
                      className="h-10 gap-1"
                      aria-label="Sync forms"
                    >
                      <RefreshCw size={14} className={metaFormsLoading ? "animate-spin" : ""} />
                      Sync
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Info size={12} /> Only forms that are mapped and active will be displayed here.
                  </p>
                </div>

                <div className="rounded-md bg-slate-50 border border-slate-200 p-3 space-y-2">
                  <p className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold">Facebook Lead Testing Tool:</span> Use this tool to test the flow of your automation when receiving leads from Facebook. It allows you to simulate lead submissions to ensure that your automation is functioning correctly.
                  </p>
                  <a
                    href="https://developers.facebook.com/tools/lead-ads-testing"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-600 hover:text-sky-700 hover:underline block"
                  >
                    Click here to access the Facebook Lead Testing Tool
                  </a>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {workflowId
                      ? "Selected form will be saved as this workflow's Meta trigger."
                      : "Confirm to create this workflow and save the mapping."}
                  </p>
                  <Button
                    onClick={saveMetaFormMapping}
                    disabled={savingForm || !metaFormSelected}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 disabled:opacity-60"
                  >
                    {savingForm ? "Saving..." : "Confirm"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={(o) => { setContactOpen(o); if (!o) setContactSub(null); }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {!contactSub ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-xl font-semibold">Contact</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 pt-2">
                {[
                  { id: "source" as const, label: "Contact Source", icon: UserPlus },
                  { id: "updated" as const, label: "Contact Updated", icon: UserCog },
                  { id: "tagged" as const, label: "Contact Tagged", icon: NotebookTabs },
                  { id: "birthday" as const, label: "Say `Happy birthday`", icon: Cake },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setContactSub(o.id)}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
                  >
                    <o.icon size={32} className="text-slate-700" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-slate-700 text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button onClick={() => setContactSub(null)} className="p-1 hover:bg-slate-100 rounded" aria-label="Back">
                  <ArrowLeft size={18} />
                </button>
                <button onClick={() => { setContactOpen(false); setContactSub(null); }} className="p-1 hover:bg-slate-100 rounded" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {contactSub === "source" && "Contact Source"}
                    {contactSub === "updated" && "Contact Updated"}
                    {contactSub === "tagged" && "Contact Tagged"}
                    {contactSub === "birthday" && "Say `Happy birthday`"}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {contactSub === "source" && "When new contact added via the selected source to send welcome message and more."}
                    {contactSub === "updated" && "Send a cheer message to contact whenever contact is updated in system even with other automation."}
                    {contactSub === "tagged" && "When a contact is tagged automation will trigger"}
                    {contactSub === "birthday" && "Celebrate with an exclusive offer or cheerful message that sends based on the birthday field in your audience."}
                  </p>
                </div>

                {contactSub === "source" && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-semibold">Select Contact Sources</Label>
                      <p className="text-xs text-slate-500 mt-0.5">Choose which sources should trigger this automation</p>
                    </div>
                    <div className="rounded-md bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-700 flex items-center gap-2">
                      <Info size={14} />
                      <span>
                        <span className="font-semibold">Tip:</span> Select one or more sources. If none selected, automation triggers for{" "}
                        <span className="font-semibold">all sources.</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {sourceOptions.map((s) => {
                        const checked = contactSources.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={cn(
                              "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-xs",
                              checked ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                setContactSources((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                              }
                            />
                            <span className="text-slate-700 truncate">{s.label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                      <span className="text-slate-700">
                        <span className="font-semibold text-emerald-600">✓ {contactSources.length} selected</span>{" "}
                        {contactSources.length === 0 && "— triggers for all sources"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setContactSources(
                            contactSources.length === sourceOptions.length ? [] : sourceOptions.map((s) => s.id)
                          )
                        }
                        className="text-sky-600 hover:text-sky-700 hover:underline font-medium"
                      >
                        {contactSources.length === sourceOptions.length ? "Clear All" : "Select All"}
                      </button>
                    </div>
                  </div>
                )}

                {contactSub === "tagged" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold">Tags</Label>
                    <Select
                      value={contactTags[0] || ""}
                      onValueChange={(v) => setContactTags(v ? [v] : [])}
                    >
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select tags" /></SelectTrigger>
                      <SelectContent>
                        {tagOptions.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {contactSub === "birthday" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">Before <span className="text-red-500">*</span></Label>
                      <Select value={birthdayBefore} onValueChange={setBirthdayBefore}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {birthdayBeforeOptions.map((o) => (
                            <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold">At <span className="text-red-500">*</span></Label>
                      <Input type="time" value={birthdayAt} onChange={(e) => setBirthdayAt(e.target.value)} className="h-10" />
                    </div>
                  </>
                )}

                <div>
                  <Button
                    onClick={() => { setContactOpen(false); setContactSub(null); }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={calendarOpen}
        onOpenChange={(o) => {
          setCalendarOpen(o);
          if (!o) {
            setCalendarSub(null);
            setCalendarSelection("");
          }
        }}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {!calendarSub ? (
            <>
              <DialogHeader className="px-6 pt-6">
                <DialogTitle className="text-xl font-semibold">Calendar</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 pt-2">
                {[
                  { id: "booked" as const, label: "Appointment Booked", icon: CalendarCheck },
                  { id: "cancelled" as const, label: "Appointment Cancelled", icon: CalendarX },
                  { id: "rescheduled" as const, label: "Appointment Rescheduled", icon: Repeat },
                  { id: "noshow" as const, label: "No-Show Appointment", icon: CalendarOff },
                  { id: "showup" as const, label: "Show Up Appointment", icon: CalendarDays },
                ].map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { setCalendarSub(o.id); setCalendarSelection(""); }}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 transition"
                  >
                    <o.icon size={32} className="text-slate-700" strokeWidth={1.5} />
                    <span className="text-sm font-medium text-slate-700 text-center">{o.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <button onClick={() => setCalendarSub(null)} className="p-1 hover:bg-slate-100 rounded" aria-label="Back">
                  <ArrowLeft size={18} />
                </button>
                <button onClick={() => { setCalendarOpen(false); setCalendarSub(null); }} className="p-1 hover:bg-slate-100 rounded" aria-label="Close">
                  <X size={18} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {(() => {
                  const meta = {
                    booked: { title: "Appointment Booked", desc: "Appointment booked will run the workflow" },
                    cancelled: { title: "Appointment Cancelled", desc: "Appointment cancelled will run the workflow" },
                    rescheduled: { title: "Appointment Rescheduled", desc: "Appointment rescheduled will run the workflow" },
                    noshow: { title: "No-Show Appointment", desc: "No-show appointment will run the workflow" },
                    showup: { title: "Show Up Appointment", desc: "Show Appointment within 24 hours will run the workflow" },
                  }[calendarSub];
                  return (
                    <>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-800">{meta.title}</h3>
                        <p className="text-sm text-slate-500">{meta.desc}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Calendars</Label>
                        <Select value={calendarSelection} onValueChange={setCalendarSelection}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a Calendars from list" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="treatment">Treatment</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Button
                          onClick={() => { setCalendarOpen(false); setCalendarSub(null); }}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6"
                        >
                          Confirm
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add an Action modal */}
      <Dialog open={actionModalOpen} onOpenChange={(o) => { setActionModalOpen(o); if (!o) { setActionSearch(""); setActionCategory("All"); } }}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <div className="max-h-[85vh] flex flex-col">
            <DialogHeader className="px-6 pt-6">
              <DialogTitle className="text-xl font-semibold">Add an Action</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">
                Set up actions that trigger automatically based on specific dates, events, or customer behaviors. Use this to send personalized emails, WhatsApp messages, or internal alerts — so your communication runs 24/7, even when you don't.
              </p>
            </DialogHeader>
            <div className="px-6 pt-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {ACTION_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActionCategory(cat)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      actionCategory === cat
                        ? "bg-emerald-500 text-white border-emerald-500"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={actionSearch}
                  onChange={(e) => setActionSearch(e.target.value)}
                  placeholder="Search actions..."
                  className="pl-8 h-9 rounded-full w-56"
                />
              </div>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 space-y-2">
              {filteredActions.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-10">No actions match your search.</div>
              ) : (
                filteredActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.key}
                      onClick={() => handleSelectAction(a)}
                      className="w-full flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3 hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors text-left"
                    >
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{a.title}</div>
                        <div className="text-xs text-slate-500 truncate">{a.description}</div>
                      </div>
                      <ArrowRight size={16} className="text-slate-400 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add/Update to CRM config modal */}
      <Dialog open={crmConfigOpen} onOpenChange={setCrmConfigOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Add/Update to CRM</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">Add/Update Contact to CRM</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Select Pipeline</Label>
              <select
                value={crmPipeline}
                onChange={(e) => { setCrmPipeline(e.target.value); setCrmStage(CRM_PIPELINES[e.target.value][0]); }}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {Object.keys(CRM_PIPELINES).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Select Pipeline Stage</Label>
              <select
                value={crmStage}
                onChange={(e) => setCrmStage(e.target.value)}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {(CRM_PIPELINES[crmPipeline] || []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Skip Lead Value Change</Label>
              <Switch checked={crmSkipValue} onCheckedChange={setCrmSkipValue} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Lead Value</Label>
              <Input
                type="number"
                value={crmLeadValue}
                onChange={(e) => setCrmLeadValue(e.target.value)}
                disabled={crmSkipValue}
              />
            </div>
            <div className="pt-2">
              <Button onClick={saveCrmConfig} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Message config modal */}
      <Dialog open={waConfigOpen} onOpenChange={setWaConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">WhatsApp Message</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">
              You have to select the text type which you want to send for example plain text or template.
            </p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span><span className="font-semibold">WhatsApp Cloud API connected.</span> Messages will be sent via your WABA account.</span>
            </div>

            <div className="space-y-1.5">
              <select
                value={waSelectedName}
                onChange={(e) => { setWaSelectedName(e.target.value); setWaVarValues({}); setWaShowPreview(false); }}
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                disabled={waTemplatesLoading}
              >
                <option value="">{waTemplatesLoading ? "Loading templates…" : "Select a template"}</option>
                {waTemplates.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>{t.name}</option>
                ))}
              </select>
              {!waTemplatesLoading && waTemplates.length === 0 && (
                <button type="button" onClick={fetchWaTemplates} className="text-xs text-emerald-600 hover:underline">
                  Reload templates
                </button>
              )}
            </div>

            {waSelectedName && (
              <>
                {waNeedsMedia && (
                  <div className="space-y-1.5">
                    <input
                      type="file"
                      accept={waHeaderFormat === "IMAGE" ? "image/*" : waHeaderFormat === "VIDEO" ? "video/*" : "*/*"}
                      onChange={(e) => setWaHeaderFile(e.target.files?.[0] || null)}
                      className="text-sm"
                    />
                  </div>
                )}

                {waVarKeys.map((k) => (
                  <div key={k} className="space-y-1.5">
                    <div className="text-sm text-slate-600">{`{{${k}}}`}</div>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter Text/Choose Custom Value"
                        value={waVarValues[k] || ""}
                        onChange={(e) => setWaVarValues((prev) => ({ ...prev, [k]: e.target.value }))}
                      />
                      <Button type="button" size="icon" className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0">
                        <span className="text-xs font-mono">{"{}"}</span>
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  onClick={() => setWaShowPreview((v) => !v)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  Preview
                </Button>

                {waShowPreview && (
                  <div className="rounded-lg bg-slate-100 p-6 flex justify-center">
                    <div className="bg-white rounded-lg shadow-md p-4 max-w-sm w-full space-y-2">
                      {waSelectedTemplate?.header_text && (
                        <div className="font-semibold text-sm text-slate-900">{waSelectedTemplate.header_text}</div>
                      )}
                      <div className="text-sm text-slate-800 whitespace-pre-wrap">{renderWaPreview()}</div>
                      {waSelectedTemplate?.footer_text && (
                        <div className="text-xs text-slate-500 pt-1">{waSelectedTemplate.footer_text}</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="pt-2">
              <Button onClick={saveWaConfig} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign To Staff config modal */}
      <Dialog open={assignStaffOpen} onOpenChange={setAssignStaffOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Assign To Staff</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">Assign To Staff</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Select Staff <span className="text-red-500">*</span>
              </Label>
              <select
                value={assignStaffSelected}
                onChange={(e) => setAssignStaffSelected(e.target.value)}
                className="w-full h-10 rounded-full border border-slate-200 bg-white px-4 text-sm"
                disabled={staffLoading}
              >
                <option value="">
                  {staffLoading ? "Loading staff…" : "Select staff to assign on contact"}
                </option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
              {!staffLoading && staffList.length === 0 && (
                <button type="button" onClick={fetchStaffList} className="text-xs text-emerald-600 hover:underline">
                  Reload staff
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={assignStaffOnlyUnassigned} onCheckedChange={setAssignStaffOnlyUnassigned} />
              <Label className="text-sm font-medium">Only apply to unassigned contacts.</Label>
            </div>
            <div className="pt-2">
              <Button onClick={saveAssignStaffConfig} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>


  );
};

export default WorkflowEditor;
