import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination, usePagedSlice } from "@/components/common/TablePagination";
import {
  CalendarDays, Plus, Search, FileText, Download, Trash2, Pencil, CheckCircle2,
  Clock, MessageCircle, Mail, X, ListChecks, CalendarIcon, Users, Eye,
  Play, Upload, GripVertical, Image as ImageIcon, Video, Paperclip,
  ChevronLeft, ChevronRight, Maximize2
} from "lucide-react";
import { format, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useClinicMasters } from "@/hooks/useClinicMasters";

type Meeting = {
  id: string;
  title: string;
  agenda: string | null;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  decisions: string | null;
  attendees: { name: string; email?: string; type?: string }[];
  organizer: string | null;
  frequency: "one_time" | "daily" | "weekly" | "monthly";
  created_at: string;
};

type ActionItem = {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed";
  completed_at: string | null;
  notes: string | null;
};

type AgendaItem = {
  id: string;
  meeting_id: string;
  position: number;
  title: string;
  duration_minutes: number;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  notes: string | null;
};

const emptyMeeting = (): Partial<Meeting> => ({
  title: "",
  agenda: "",
  scheduled_at: new Date().toISOString(),
  duration_minutes: 30,
  location: "",
  meeting_link: "",
  status: "scheduled",
  attendees: [],
  organizer: "",
  frequency: "one_time",
});

export default function Meetings() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editing, setEditing] = useState<Partial<Meeting> | null>(null);
  const [detailMeetingId, setDetailMeetingId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [presentingMeetingId, setPresentingMeetingId] = useState<string | null>(null);

  const { doctorNames } = useClinicMasters();
  const staffOptions = useMemo(() => Array.from(new Set((doctorNames || []).filter(Boolean))), [doctorNames]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: m }, { data: ai }, { data: ag }] = await Promise.all([
      supabase.from("meetings" as any).select("*").order("scheduled_at", { ascending: false }),
      supabase.from("meeting_action_items" as any).select("*").order("created_at", { ascending: true }),
      supabase.from("meeting_agenda_items" as any).select("*").order("position", { ascending: true }),
    ]);
    setMeetings((m as any) || []);
    setActionItems((ai as any) || []);
    setAgendaItems((ag as any) || []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.organizer || "").toLowerCase().includes(q) ||
        (m.agenda || "").toLowerCase().includes(q)
      );
    });
  }, [meetings, search, statusFilter]);

  const paged = usePagedSlice(filtered, page, pageSize);

  const detailMeeting = useMemo(
    () => meetings.find((m) => m.id === detailMeetingId) || null,
    [meetings, detailMeetingId]
  );
  const detailItems = useMemo(
    () => actionItems.filter((a) => a.meeting_id === detailMeetingId),
    [actionItems, detailMeetingId]
  );
  const detailAgenda = useMemo(
    () => agendaItems.filter((a) => a.meeting_id === detailMeetingId).sort((a, b) => a.position - b.position),
    [agendaItems, detailMeetingId]
  );
  const presentingMeeting = useMemo(
    () => meetings.find((m) => m.id === presentingMeetingId) || null,
    [meetings, presentingMeetingId]
  );
  const presentingAgenda = useMemo(
    () => agendaItems.filter((a) => a.meeting_id === presentingMeetingId).sort((a, b) => a.position - b.position),
    [agendaItems, presentingMeetingId]
  );

  // Calendar grid
  const calStart = startOfWeek(startOfMonth(calendarMonth));
  const calEnd = endOfWeek(endOfMonth(calendarMonth));
  const calendarDays: Date[] = [];
  for (let d = calStart; d <= calEnd; d = addDays(d, 1)) calendarDays.push(d);

  // Stats
  const pendingCount = actionItems.filter((a) => a.status !== "completed").length;
  const completedCount = actionItems.filter((a) => a.status === "completed").length;
  const upcomingCount = meetings.filter((m) => new Date(m.scheduled_at) >= new Date() && m.status !== "cancelled").length;

  // ---------------- Save ----------------
  const saveMeeting = async () => {
    if (!editing?.title || !editing.scheduled_at) {
      toast.error("Title and date are required");
      return;
    }
    const payload: any = {
      title: editing.title,
      agenda: editing.agenda || null,
      scheduled_at: editing.scheduled_at,
      duration_minutes: editing.duration_minutes ?? 30,
      location: editing.location || null,
      meeting_link: editing.meeting_link || null,
      status: editing.status || "scheduled",
      notes: editing.notes || null,
      decisions: editing.decisions || null,
      attendees: editing.attendees || [],
      organizer: editing.organizer || null,
      frequency: editing.frequency || "one_time",
    };
    if (editing.id) {
      const { error } = await supabase.from("meetings" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Meeting updated");
    } else {
      const { error } = await supabase.from("meetings" as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Meeting scheduled");
    }
    setEditing(null);
    void load();
  };

  const deleteMeeting = async (id: string) => {
    if (!confirm("Delete this meeting and all its action items?")) return;
    const { error } = await supabase.from("meetings" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    setDetailMeetingId(null);
    void load();
  };

  // ---------------- Agenda items ----------------
  const addAgendaItem = async (meetingId: string, payload?: { title?: string; duration_minutes?: number }) => {
    const existing = agendaItems.filter((a) => a.meeting_id === meetingId);
    const nextPos = existing.length > 0 ? Math.max(...existing.map((a) => a.position)) + 1 : 0;
    const { error } = await supabase.from("meeting_agenda_items" as any).insert({
      meeting_id: meetingId,
      position: nextPos,
      title: payload?.title || "New agenda topic",
      duration_minutes: payload?.duration_minutes ?? 5,
    });
    if (error) return toast.error(error.message);
    void load();
  };

  const updateAgendaItem = async (id: string, patch: Partial<AgendaItem>) => {
    const { error } = await supabase.from("meeting_agenda_items" as any).update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const deleteAgendaItem = async (id: string) => {
    const { error } = await supabase.from("meeting_agenda_items" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const moveAgendaItem = async (id: string, dir: -1 | 1) => {
    const meetingId = agendaItems.find((a) => a.id === id)?.meeting_id;
    if (!meetingId) return;
    const list = agendaItems.filter((a) => a.meeting_id === meetingId).sort((a, b) => a.position - b.position);
    const idx = list.findIndex((a) => a.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx], b = list[swapIdx];
    await Promise.all([
      supabase.from("meeting_agenda_items" as any).update({ position: b.position }).eq("id", a.id),
      supabase.from("meeting_agenda_items" as any).update({ position: a.position }).eq("id", b.id),
    ]);
    void load();
  };

  const uploadAgendaAttachment = async (id: string, file: File) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("meeting-files").upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("meeting-files").getPublicUrl(path);
    const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "file";
    await updateAgendaItem(id, { attachment_url: pub.publicUrl, attachment_type: type, attachment_name: file.name });
    toast.success("Attachment uploaded");
  };

  // ---------------- Action items ----------------
  const addActionItem = async (meetingId: string) => {
    const { error } = await supabase.from("meeting_action_items" as any).insert({
      meeting_id: meetingId,
      title: "New action item",
      status: "pending",
      priority: "medium",
    });
    if (error) return toast.error(error.message);
    void load();
  };

  const quickAddActionItem = async (meetingId: string, payload: { title: string; assignee_name?: string; due_date?: string | null }) => {
    if (!payload.title.trim()) {
      toast.error("Action item details required");
      return;
    }
    const { error } = await supabase.from("meeting_action_items" as any).insert({
      meeting_id: meetingId,
      title: payload.title.trim(),
      assignee_name: payload.assignee_name || null,
      due_date: payload.due_date || null,
      status: "pending",
      priority: "medium",
    });
    if (error) return toast.error(error.message);
    toast.success("Action item added");
    void load();
  };

  const updateActionItem = async (id: string, patch: Partial<ActionItem>) => {
    const updates: any = { ...patch };
    if (patch.status === "completed" && !patch.completed_at) updates.completed_at = new Date().toISOString();
    if (patch.status && patch.status !== "completed") updates.completed_at = null;
    const { error } = await supabase.from("meeting_action_items" as any).update(updates).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const deleteActionItem = async (id: string) => {
    const { error } = await supabase.from("meeting_action_items" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  // ---------------- PDF ----------------
  const exportMoMPdf = async (mode: "pending" | "completed" | "full") => {
    if (!detailMeeting) return;
    const items = mode === "full"
      ? detailItems
      : detailItems.filter((a) => (mode === "pending" ? a.status !== "completed" : a.status === "completed"));

    const { addClinicPdfHeader, addClinicPdfFooter, fetchClinicBranding } = await import("@/lib/clinicBranding");
    const branding = await fetchClinicBranding();
    const doc = new jsPDF();
    const startY = await addClinicPdfHeader(doc, branding);
    const title = mode === "pending" ? "Pending Action Items" : mode === "completed" ? "Completed Action Items" : "Minutes of Meeting";
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Minutes of Meeting", 14, startY);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Title: ${detailMeeting.title}`, 14, startY + 8);
    doc.text(`Date: ${format(new Date(detailMeeting.scheduled_at), "dd MMM yyyy, hh:mm a")}`, 14, startY + 14);
    doc.text(`Duration: ${detailMeeting.duration_minutes} min`, 14, startY + 20);
    if (detailMeeting.organizer) doc.text(`Organizer: ${detailMeeting.organizer}`, 14, startY + 26);
    if (detailMeeting.location) doc.text(`Location: ${detailMeeting.location}`, 110, startY + 26);

    let y = startY + 34;
    if (detailMeeting.attendees?.length) {
      doc.setFontSize(11); doc.text("Attendees:", 14, y); y += 6;
      doc.setFontSize(9);
      doc.text(detailMeeting.attendees.map((a) => a.name).join(", "), 14, y, { maxWidth: 180 });
      y += 10;
    }
    if (detailMeeting.agenda) {
      doc.setFontSize(11); doc.text("Agenda:", 14, y); y += 6;
      doc.setFontSize(9); doc.text(detailMeeting.agenda, 14, y, { maxWidth: 180 });
      y += 14;
    }
    if (mode === "full" && detailMeeting.notes) {
      doc.setFontSize(11); doc.text("Notes / Discussion:", 14, y); y += 6;
      doc.setFontSize(9); doc.text(detailMeeting.notes, 14, y, { maxWidth: 180 }); y += 14;
    }
    if (mode === "full" && detailMeeting.decisions) {
      doc.setFontSize(11); doc.text("Decisions:", 14, y); y += 6;
      doc.setFontSize(9); doc.text(detailMeeting.decisions, 14, y, { maxWidth: 180 }); y += 14;
    }

    doc.setFontSize(12); doc.text(title, 14, y); y += 4;
    autoTable(doc, {
      startY: y,
      head: [["#", "Action", "Assignee", "Due", "Priority", "Status"]],
      body: items.map((a, i) => [
        String(i + 1),
        a.title + (a.description ? `\n${a.description}` : ""),
        a.assignee_name || "—",
        a.due_date ? format(new Date(a.due_date), "dd MMM yyyy") : "—",
        a.priority,
        a.status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 95] },
      margin: { bottom: 30 },
      didDrawPage: () => addClinicPdfFooter(doc),
    });

    const fname = `MoM_${detailMeeting.title.replace(/\s+/g, "_")}_${mode}.pdf`;
    doc.save(fname);
    toast.success("PDF downloaded");
  };

  const shareWhatsApp = () => {
    if (!detailMeeting) return;
    const lines = [
      `*Meeting:* ${detailMeeting.title}`,
      `*Date:* ${format(new Date(detailMeeting.scheduled_at), "dd MMM yyyy, hh:mm a")}`,
      detailMeeting.location ? `*Location:* ${detailMeeting.location}` : "",
      detailMeeting.meeting_link ? `*Link:* ${detailMeeting.meeting_link}` : "",
      detailMeeting.agenda ? `\n*Agenda:*\n${detailMeeting.agenda}` : "",
      detailItems.length ? `\n*Action Items:*\n${detailItems.map((a, i) => `${i + 1}. ${a.title} — ${a.assignee_name || "Unassigned"} [${a.status}]`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
  };

  const shareEmail = () => {
    if (!detailMeeting) return;
    const to = detailMeeting.attendees?.map((a) => a.email).filter(Boolean).join(",") || "";
    const subject = `Meeting: ${detailMeeting.title}`;
    const body = `Date: ${format(new Date(detailMeeting.scheduled_at), "dd MMM yyyy, hh:mm a")}\n\nAgenda:\n${detailMeeting.agenda || "—"}\n\nNotes:\n${detailMeeting.notes || "—"}`;
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      in_progress: "bg-amber-100 text-amber-700",
      completed: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-rose-100 text-rose-700",
    };
    return <Badge className={cn("font-normal", map[s])}>{s.replace("_", " ")}</Badge>;
  };

  // -------- Editor helpers --------
  const addAttendee = (name: string, email?: string, type = "staff") => {
    if (!name.trim()) return;
    setEditing((p) => ({ ...p!, attendees: [...(p?.attendees || []), { name, email, type }] }));
  };
  const removeAttendee = (idx: number) => {
    setEditing((p) => ({ ...p!, attendees: (p?.attendees || []).filter((_, i) => i !== idx) }));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" /> Meetings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule meetings, capture Minutes of Meeting (MoM), track action items.
          </p>
        </div>
        <Button onClick={() => setEditing(emptyMeeting())} className="gap-2">
          <Plus size={16} /> New Meeting
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Meetings</div><div className="text-2xl font-bold">{meetings.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Upcoming</div><div className="text-2xl font-bold text-blue-600">{upcomingCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending Action Items</div><div className="text-2xl font-bold text-amber-600">{pendingCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Completed Action Items</div><div className="text-2xl font-bold text-emerald-600">{completedCount}</div></CardContent></Card>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="list"><ListChecks size={14} className="mr-1" /> List</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarIcon size={14} className="mr-1" /> Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search title, agenda, organizer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Organizer</TableHead>
                      <TableHead>Attendees</TableHead>
                      <TableHead>Action Items</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : paged.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No meetings found</TableCell></TableRow>
                    ) : (
                      paged.map((m) => {
                        const items = actionItems.filter((a) => a.meeting_id === m.id);
                        const pending = items.filter((a) => a.status !== "completed").length;
                        const done = items.filter((a) => a.status === "completed").length;
                        return (
                          <TableRow key={m.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetailMeetingId(m.id)}>
                            <TableCell className="font-medium">{m.title}</TableCell>
                            <TableCell className="text-sm">{format(new Date(m.scheduled_at), "dd MMM yyyy, hh:mm a")}</TableCell>
                            <TableCell className="text-sm">{m.organizer || "—"}</TableCell>
                            <TableCell className="text-sm">{m.attendees?.length || 0}</TableCell>
                            <TableCell className="text-sm">
                              {items.length === 0 ? "—" : (
                                <span className="flex gap-1">
                                  <Badge variant="outline" className="text-amber-700">{pending} pending</Badge>
                                  <Badge variant="outline" className="text-emerald-700">{done} done</Badge>
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{statusBadge(m.status)}</TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil size={14} /></Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteMeeting(m.id)}><Trash2 size={14} /></Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} label="meetings" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{format(calendarMonth, "MMMM yyyy")}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>‹ Prev</Button>
                <Button size="sm" variant="outline" onClick={() => setCalendarMonth(new Date())}>Today</Button>
                <Button size="sm" variant="outline" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>Next ›</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-border rounded overflow-hidden">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                  <div key={d} className="bg-muted text-center text-xs font-semibold py-2">{d}</div>
                ))}
                {calendarDays.map((day) => {
                  const dayMeetings = meetings.filter((m) => isSameDay(new Date(m.scheduled_at), day));
                  const isCurMonth = day.getMonth() === calendarMonth.getMonth();
                  return (
                    <div key={day.toISOString()} className={cn("bg-background min-h-[90px] p-1.5", !isCurMonth && "opacity-40")}>
                      <div className="text-xs font-medium mb-1">{format(day, "d")}</div>
                      <div className="space-y-1">
                        {dayMeetings.slice(0, 3).map((m) => (
                          <button key={m.id} onClick={() => setDetailMeetingId(m.id)} className="w-full text-left text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate hover:bg-primary/20">
                            {format(new Date(m.scheduled_at), "HH:mm")} {m.title}
                          </button>
                        ))}
                        {dayMeetings.length > 3 && (
                          <div className="text-[10px] text-muted-foreground">+{dayMeetings.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- Editor Dialog ---------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Meeting" : "Schedule New Meeting"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Weekly Operations Review" />
              </div>
              <div>
                <Label>Frequency</Label>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {([
                    { v: "daily", l: "Daily" },
                    { v: "weekly", l: "Weekly" },
                    { v: "monthly", l: "Monthly" },
                    { v: "one_time", l: "One-time" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setEditing({ ...editing, frequency: opt.v })}
                      className={cn(
                        "h-9 rounded-md border text-sm font-medium transition",
                        (editing.frequency || "one_time") === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted"
                      )}
                    >{opt.l}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date & Time *</Label>
                  <Input type="datetime-local" value={editing.scheduled_at ? format(new Date(editing.scheduled_at), "yyyy-MM-dd'T'HH:mm") : ""} onChange={(e) => setEditing({ ...editing, scheduled_at: new Date(e.target.value).toISOString() })} />
                </div>
                <div>
                  <Label>Duration (min)</Label>
                  <Input type="number" value={editing.duration_minutes ?? 30} onChange={(e) => setEditing({ ...editing, duration_minutes: parseInt(e.target.value) || 30 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Organizer</Label>
                  <Input value={editing.organizer || ""} onChange={(e) => setEditing({ ...editing, organizer: e.target.value })} list="organizer-list" />
                  <datalist id="organizer-list">
                    {staffOptions.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status || "scheduled"} onValueChange={(v) => setEditing({ ...editing, status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Location</Label>
                  <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} placeholder="Conference room / Online" />
                </div>
                <div>
                  <Label>Meeting Link</Label>
                  <Input value={editing.meeting_link || ""} onChange={(e) => setEditing({ ...editing, meeting_link: e.target.value })} placeholder="https://..." />
                </div>
              </div>

              <div>
                <Label>Attendees</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(editing.attendees || []).map((a, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {a.name}{a.email ? ` <${a.email}>` : ""}
                      <button onClick={() => removeAttendee(i)}><X size={12} /></button>
                    </Badge>
                  ))}
                </div>
                <AttendeeAdder onAdd={addAttendee} staffOptions={staffOptions} />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Agenda Items</Label>
                  {editing.id && (
                    <Button size="sm" variant="outline" type="button" onClick={() => addAgendaItem(editing.id!)} className="h-7 gap-1">
                      <Plus size={12} /> Add Item
                    </Button>
                  )}
                </div>
                {!editing.id ? (
                  <p className="text-xs text-muted-foreground mt-1">Save the meeting first, then add structured agenda items (with minutes & video/poster uploads).</p>
                ) : (
                  <AgendaItemsEditor
                    items={agendaItems.filter((a) => a.meeting_id === editing.id).sort((a, b) => a.position - b.position)}
                    onUpdate={updateAgendaItem}
                    onDelete={deleteAgendaItem}
                    onMove={moveAgendaItem}
                    onUpload={uploadAgendaAttachment}
                  />
                )}
              </div>
              <div>
                <Label>Agenda Notes (free text)</Label>
                <Textarea value={editing.agenda || ""} onChange={(e) => setEditing({ ...editing, agenda: e.target.value })} rows={2} placeholder="Optional summary..." />
              </div>
              <div>
                <Label>Notes / Discussion (MoM)</Label>
                <Textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={4} placeholder="What was discussed..." />
              </div>
              <div>
                <Label>Decisions</Label>
                <Textarea value={editing.decisions || ""} onChange={(e) => setEditing({ ...editing, decisions: e.target.value })} rows={3} placeholder="Decisions made..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveMeeting}>Save Meeting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Detail Dialog (Fortune-OS style) ---------- */}
      <Dialog open={!!detailMeetingId} onOpenChange={(o) => !o && setDetailMeetingId(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          {detailMeeting && (
            <MeetingDetailView
              meeting={detailMeeting}
              items={detailItems}
              agenda={detailAgenda}
              staffOptions={staffOptions}
              onAddItem={(payload) => quickAddActionItem(detailMeeting.id, payload)}
              onUpdateItem={updateActionItem}
              onDeleteItem={deleteActionItem}
              onAddAgenda={() => addAgendaItem(detailMeeting.id)}
              onUpdateAgenda={updateAgendaItem}
              onDeleteAgenda={deleteAgendaItem}
              onMoveAgenda={moveAgendaItem}
              onUploadAgenda={uploadAgendaAttachment}
              onPresent={() => { setPresentingMeetingId(detailMeeting.id); setDetailMeetingId(null); }}
              onExportPdf={exportMoMPdf}
              onShareWA={shareWhatsApp}
              onShareEmail={shareEmail}
              onEdit={() => { setEditing(detailMeeting); setDetailMeetingId(null); }}
              onDelete={() => deleteMeeting(detailMeeting.id)}
              statusBadge={statusBadge}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Presentation Mode ---------- */}
      <Dialog open={!!presentingMeetingId} onOpenChange={(o) => !o && setPresentingMeetingId(null)}>
        <DialogContent className="max-w-[100vw] w-screen h-screen sm:rounded-none p-0 border-0">
          {presentingMeeting && (
            <PresentationMode
              meeting={presentingMeeting}
              agenda={presentingAgenda}
              onClose={() => setPresentingMeetingId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AttendeeAdder({ onAdd, staffOptions }: { onAdd: (name: string, email?: string, type?: string) => void; staffOptions: string[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div className="flex gap-2">
      <Input className="h-8" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} list="att-staff-list" />
      <Input className="h-8" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button size="sm" type="button" onClick={() => { onAdd(name, email || undefined); setName(""); setEmail(""); }}>Add</Button>
      <datalist id="att-staff-list">
        {staffOptions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}

// ===================== Fortune-OS style Meeting Detail =====================
function MeetingDetailView({
  meeting, items, agenda, staffOptions,
  onAddItem, onUpdateItem, onDeleteItem,
  onAddAgenda, onUpdateAgenda, onDeleteAgenda, onMoveAgenda, onUploadAgenda, onPresent,
  onExportPdf, onShareWA, onShareEmail, onEdit, onDelete, statusBadge,
}: {
  meeting: Meeting;
  items: ActionItem[];
  agenda: AgendaItem[];
  staffOptions: string[];
  onAddItem: (p: { title: string; assignee_name?: string; due_date?: string | null }) => void;
  onUpdateItem: (id: string, patch: Partial<ActionItem>) => void;
  onDeleteItem: (id: string) => void;
  onAddAgenda: () => void;
  onUpdateAgenda: (id: string, patch: Partial<AgendaItem>) => void;
  onDeleteAgenda: (id: string) => void;
  onMoveAgenda: (id: string, dir: -1 | 1) => void;
  onUploadAgenda: (id: string, file: File) => void;
  onPresent: () => void;
  onExportPdf: (mode: "pending" | "completed" | "full") => void;
  onShareWA: () => void;
  onShareEmail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  statusBadge: (s: string) => JSX.Element;
}) {
  const [mode, setMode] = useState<"planning" | "meeting">("meeting");
  const [view, setView] = useState<"all" | "pending" | "completed">("all");

  const pendingItems = items.filter((a) => a.status !== "completed");
  const completedItems = items.filter((a) => a.status === "completed");
  const visibleItems =
    view === "pending" ? pendingItems : view === "completed" ? completedItems : items;

  // Quick add row
  const [qDate, setQDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [qTitle, setQTitle] = useState("");
  const [qAssignee, setQAssignee] = useState("");

  const submitQuick = () => {
    onAddItem({ title: qTitle, assignee_name: qAssignee || undefined, due_date: qDate || null });
    setQTitle(""); setQAssignee("");
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-lg bg-primary/15 flex items-center justify-center">
            <CalendarDays className="text-primary" size={22} />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
              {meeting.title} {statusBadge(meeting.status)}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(meeting.scheduled_at), "dd MMM yyyy, hh:mm a")} · {meeting.duration_minutes}m
              {meeting.organizer ? ` · ${meeting.organizer}` : ""}
            </p>
          </div>
        </div>
      </DialogHeader>

      {/* PLANNING <-> MEETING toggle */}
      <div className="flex items-center justify-center gap-3 my-3">
        <button
          onClick={() => setMode("planning")}
          className={cn("text-xs font-bold tracking-wider uppercase transition", mode === "planning" ? "text-primary" : "text-muted-foreground")}
        >Planning</button>
        <button
          onClick={() => setMode(mode === "planning" ? "meeting" : "planning")}
          className={cn(
            "relative w-14 h-7 rounded-full transition",
            mode === "meeting" ? "bg-primary" : "bg-muted"
          )}
          aria-label="Toggle planning/meeting"
        >
          <span className={cn(
            "absolute top-0.5 size-6 rounded-full bg-white shadow transition-all",
            mode === "meeting" ? "left-7" : "left-0.5"
          )} />
        </button>
        <button
          onClick={() => setMode("meeting")}
          className={cn("text-xs font-bold tracking-wider uppercase transition", mode === "meeting" ? "text-primary" : "text-muted-foreground")}
        >Meeting</button>
      </div>

      {mode === "planning" ? (
        <div className="space-y-4">
          {/* Agenda items */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1">
                <ListChecks size={12} /> Agenda Items ({agenda.length})
                {agenda.length > 0 && <span className="ml-2 text-muted-foreground/70">· {agenda.reduce((s, a) => s + (a.duration_minutes || 0), 0)} min total</span>}
              </Label>
              <div className="flex gap-2">
                {agenda.length > 0 && (
                  <Button size="sm" variant="default" onClick={onPresent} className="gap-1 h-8">
                    <Play size={14} /> Present
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onAddAgenda} className="gap-1 h-8">
                  <Plus size={12} /> Add
                </Button>
              </div>
            </div>
            {agenda.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center border-2 border-dashed rounded">
                No agenda items yet. Add topics, allocate minutes, attach videos/posters.
              </div>
            ) : (
              <AgendaItemsEditor
                items={agenda}
                onUpdate={onUpdateAgenda}
                onDelete={onDeleteAgenda}
                onMove={onMoveAgenda}
                onUpload={onUploadAgenda}
              />
            )}
          </Card>

          {meeting.agenda && (
            <Card className="p-4">
              <Label className="text-xs uppercase text-muted-foreground">Agenda Notes</Label>
              <div className="text-sm whitespace-pre-wrap mt-1">{meeting.agenda}</div>
            </Card>
          )}
          {meeting.attendees?.length > 0 && (
            <Card className="p-4">
              <Label className="text-xs uppercase text-muted-foreground flex items-center gap-1"><Users size={12} /> Attendees ({meeting.attendees.length})</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {meeting.attendees.map((a, i) => (
                  <Badge key={i} variant="secondary">{a.name}{a.email ? ` <${a.email}>` : ""}</Badge>
                ))}
              </div>
            </Card>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3"><div className="text-xs text-muted-foreground">Location</div><div className="text-sm mt-1">{meeting.location || "—"}</div></Card>
            <Card className="p-3"><div className="text-xs text-muted-foreground">Meeting Link</div><div className="text-sm mt-1 truncate">{meeting.meeting_link || "—"}</div></Card>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* MoM header strip */}
          <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <FileText className="text-orange-500" size={18} />
              </div>
              <div>
                <div className="font-semibold">Minutes of Meeting</div>
                <div className="text-xs text-muted-foreground">
                  <button onClick={() => setView("pending")} className="hover:underline">{pendingItems.length} pending</button>
                  {" · "}
                  <button onClick={() => setView("completed")} className="hover:underline">{completedItems.length} completed</button>
                  {view !== "all" && (
                    <>{" · "}<button onClick={() => setView("all")} className="hover:underline text-primary">show all</button></>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onExportPdf("pending")} className="gap-1 rounded-full">
                <Eye size={14} /> Pending <span className="font-bold">PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => onExportPdf("completed")} className="gap-1 rounded-full">
                <Eye size={14} /> Completed <span className="font-bold">PDF</span>
              </Button>
            </div>
          </div>

          {/* Notes / Decisions (compact) */}
          {(meeting.notes || meeting.decisions) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {meeting.notes && (
                <Card className="p-3">
                  <Label className="text-xs uppercase text-muted-foreground">Notes</Label>
                  <div className="text-sm whitespace-pre-wrap mt-1">{meeting.notes}</div>
                </Card>
              )}
              {meeting.decisions && (
                <Card className="p-3">
                  <Label className="text-xs uppercase text-muted-foreground">Decisions</Label>
                  <div className="text-sm whitespace-pre-wrap mt-1">{meeting.decisions}</div>
                </Card>
              )}
            </div>
          )}

          {/* Quick Add Action Item row */}
          <div className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border-2 border-dashed">
            <Input
              type="date"
              className="col-span-3 h-9"
              value={qDate}
              onChange={(e) => setQDate(e.target.value)}
            />
            <Input
              className="col-span-5 h-9"
              placeholder="Action item details..."
              value={qTitle}
              onChange={(e) => setQTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitQuick()}
            />
            <Input
              className="col-span-3 h-9"
              placeholder="Assignee..."
              value={qAssignee}
              onChange={(e) => setQAssignee(e.target.value)}
              list="quick-staff-list"
            />
            <Button className="col-span-1 h-9 gap-1" onClick={submitQuick}>
              <Plus size={14} />
            </Button>
            <datalist id="quick-staff-list">
              {staffOptions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Action items list / empty state */}
          {visibleItems.length === 0 ? (
            <div className="border-2 border-dashed rounded-lg py-12 text-center">
              <div className="size-12 mx-auto rounded-lg bg-orange-500/15 flex items-center justify-center mb-3">
                <CheckCircle2 className="text-orange-500" size={22} />
              </div>
              <div className="font-semibold">No action items yet</div>
              <div className="text-xs text-muted-foreground mt-1">Add your first action item above</div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((a) => (
                <Card key={a.id} className={cn("p-3", a.status === "completed" && "bg-emerald-50/40 dark:bg-emerald-950/20")}>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <button
                      className={cn(
                        "col-span-1 size-6 rounded-full border-2 flex items-center justify-center transition",
                        a.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" : "border-muted-foreground/40 hover:border-primary"
                      )}
                      onClick={() => onUpdateItem(a.id, { status: a.status === "completed" ? "pending" : "completed" })}
                    >
                      {a.status === "completed" && <CheckCircle2 size={14} />}
                    </button>
                    <Input className={cn("col-span-4 h-8 border-0 bg-transparent", a.status === "completed" && "line-through text-muted-foreground")} value={a.title} onChange={(e) => onUpdateItem(a.id, { title: e.target.value })} />
                    <Input className="col-span-2 h-8" type="date" value={a.due_date || ""} onChange={(e) => onUpdateItem(a.id, { due_date: e.target.value || null })} />
                    <Input className="col-span-2 h-8" value={a.assignee_name || ""} onChange={(e) => onUpdateItem(a.id, { assignee_name: e.target.value })} placeholder="Assignee" list="quick-staff-list" />
                    <Select value={a.priority} onValueChange={(v) => onUpdateItem(a.id, { priority: v as any })}>
                      <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" className="col-span-1" onClick={() => onDeleteItem(a.id)}><Trash2 size={14} /></Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <DialogFooter className="flex-wrap gap-2 mt-4">
        <Button variant="default" onClick={onPresent} className="gap-1" disabled={agenda.length === 0}>
          <Play size={14} /> Present Meeting
        </Button>
        <Button variant="outline" onClick={() => onExportPdf("full")} className="gap-1"><Download size={14} /> Full MoM PDF</Button>
        <Button variant="outline" onClick={onShareWA} className="gap-1"><MessageCircle size={14} /> WhatsApp</Button>
        <Button variant="outline" onClick={onShareEmail} className="gap-1"><Mail size={14} /> Email</Button>
        <Button variant="outline" onClick={onEdit} className="gap-1"><Pencil size={14} /> Edit</Button>
        <Button variant="destructive" onClick={onDelete} className="gap-1"><Trash2 size={14} /> Delete</Button>
      </DialogFooter>
    </>
  );
}

// ===================== Agenda Items Editor =====================
function AgendaItemsEditor({
  items, onUpdate, onDelete, onMove, onUpload,
}: {
  items: AgendaItem[];
  onUpdate: (id: string, patch: Partial<AgendaItem>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onUpload: (id: string, file: File) => void;
}) {
  return (
    <div className="space-y-2 mt-2">
      <div className="grid grid-cols-12 gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <div className="col-span-1">#</div>
        <div className="col-span-5">Topic</div>
        <div className="col-span-2">Minutes</div>
        <div className="col-span-3">Attachment</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>
      {items.map((it, idx) => (
        <Card key={it.id} className="p-2">
          <div className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-1 flex items-center gap-1">
              <span className="text-sm font-semibold">{idx + 1}</span>
              <div className="flex flex-col">
                <button className="text-muted-foreground hover:text-foreground" onClick={() => onMove(it.id, -1)} disabled={idx === 0}>▲</button>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => onMove(it.id, 1)} disabled={idx === items.length - 1}>▼</button>
              </div>
            </div>
            <Input
              className="col-span-5 h-8"
              value={it.title}
              onChange={(e) => onUpdate(it.id, { title: e.target.value })}
              placeholder="Topic title (e.g. Welcome Note, Anthem Video)"
            />
            <div className="col-span-2 flex items-center gap-1">
              <Input
                type="number"
                className="h-8"
                min={1}
                value={it.duration_minutes}
                onChange={(e) => onUpdate(it.id, { duration_minutes: parseInt(e.target.value) || 0 })}
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <div className="col-span-3 flex items-center gap-1">
              {it.attachment_url ? (
                <Badge variant="secondary" className="gap-1 max-w-full truncate">
                  {it.attachment_type === "video" ? <Video size={12} /> : it.attachment_type === "image" ? <ImageIcon size={12} /> : <Paperclip size={12} />}
                  <span className="truncate max-w-[80px]">{it.attachment_name || "file"}</span>
                  <button onClick={() => onUpdate(it.id, { attachment_url: null, attachment_type: null, attachment_name: null })}><X size={10} /></button>
                </Badge>
              ) : (
                <label className="cursor-pointer text-xs text-primary hover:underline flex items-center gap-1">
                  <Upload size={12} /> Upload
                  <input
                    type="file"
                    className="hidden"
                    accept="video/*,image/*,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(it.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            <div className="col-span-1 text-right">
              <Button size="sm" variant="ghost" onClick={() => onDelete(it.id)}><Trash2 size={14} /></Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===================== Presentation Mode =====================
function PresentationMode({
  meeting, agenda, onClose,
}: {
  meeting: Meeting;
  agenda: AgendaItem[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const current = agenda[idx];
  const total = agenda.length;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-background p-8">
        <div className="text-center">
          <p className="text-muted-foreground">No agenda items to present.</p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </div>
      </div>
    );
  }

  const next = () => setIdx((i) => Math.min(i + 1, total - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div>
          <div className="font-semibold text-lg">{meeting.title}</div>
          <div className="text-xs text-muted-foreground">
            Agenda {idx + 1} of {total} · {current.duration_minutes} min
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev} disabled={idx === 0} className="gap-1">
            <ChevronLeft size={14} /> Prev
          </Button>
          <Button variant="outline" size="sm" onClick={next} disabled={idx === total - 1} className="gap-1">
            Next <ChevronRight size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X size={16} /></Button>
        </div>
      </div>

      {/* Slide */}
      <div className="flex-1 overflow-auto p-8 flex flex-col items-center justify-center">
        <div className="w-full max-w-5xl">
          <div className="text-center mb-6">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Topic {idx + 1}</div>
            <h2 className="text-4xl font-bold">{current.title}</h2>
            <div className="text-sm text-muted-foreground mt-2 flex items-center justify-center gap-1">
              <Clock size={14} /> {current.duration_minutes} minutes
            </div>
          </div>

          {current.attachment_url ? (
            <div className="rounded-xl overflow-hidden border bg-muted flex items-center justify-center" style={{ minHeight: 360 }}>
              {current.attachment_type === "video" ? (
                <video src={current.attachment_url} controls autoPlay className="max-h-[60vh] w-full" />
              ) : current.attachment_type === "image" ? (
                <img src={current.attachment_url} alt={current.title} className="max-h-[60vh] object-contain" />
              ) : (
                <a href={current.attachment_url} target="_blank" rel="noreferrer" className="text-primary underline flex items-center gap-2 p-8">
                  <Paperclip size={16} /> Open {current.attachment_name || "attachment"}
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed py-20 text-center text-muted-foreground">
              No attachment for this topic
            </div>
          )}

          {current.notes && (
            <Card className="p-4 mt-6">
              <div className="text-xs uppercase text-muted-foreground mb-1">Notes</div>
              <div className="text-sm whitespace-pre-wrap">{current.notes}</div>
            </Card>
          )}
        </div>
      </div>

      {/* Bottom strip — agenda thumbnails */}
      <div className="border-t bg-muted/30 px-6 py-3 shrink-0 overflow-x-auto">
        <div className="flex gap-2">
          {agenda.map((a, i) => (
            <button
              key={a.id}
              onClick={() => setIdx(i)}
              className={cn(
                "px-3 py-2 rounded-md text-xs whitespace-nowrap border transition shrink-0",
                i === idx ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              )}
            >
              <div className="font-semibold">{i + 1}. {a.title}</div>
              <div className="text-[10px] opacity-70">{a.duration_minutes}m {a.attachment_type ? `· ${a.attachment_type}` : ""}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
