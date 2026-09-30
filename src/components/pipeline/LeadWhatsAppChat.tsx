import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Send, MessageSquare, Loader2, CheckCheck, Check, AlertCircle, MoreVertical, Trash2, Ban } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import WhatsAppTemplateMessage from "@/components/whatsapp/WhatsAppTemplateMessage";
import {
  extractSentTemplate,
  resolveTemplateDefs,
  type SentTemplateInfo,
  type TemplateDef,
} from "@/lib/whatsappTemplatePreview";

type ChatMsg = {
  id: string;
  direction: "in" | "out";
  text: string;
  at?: string;
  status?: string;
  error?: string;
  mediaUrl?: string;
  mediaKind?: string;
  mediaFilename?: string;
  template?: SentTemplateInfo;
  deletedForEveryone?: boolean;
};



const normalizeDigits = (raw?: string | null) => (raw || "").replace(/\D/g, "");

/** Build the plausible WhatsApp ids for a lead phone (with / without country code). */
const phoneVariants = (raw?: string | null): string[] => {
  const d = normalizeDigits(raw);
  if (!d || d.length < 8) return [];
  const set = new Set<string>([d]);
  if (d.length === 10) set.add(`91${d}`);
  if (d.length > 10) set.add(d.slice(-10));
  return Array.from(set);
};

interface Props {
  leadPhone?: string | null;
  leadName?: string | null;
}

/**
 * Lead-scoped WhatsApp conversation. Shows ONLY the thread belonging to this
 * lead's phone number — no other lead conversations are ever loaded.
 */
export const LeadWhatsAppChat = ({ leadPhone, leadName }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [templateDefs, setTemplateDefs] = useState<Map<string, TemplateDef>>(new Map());

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const variants = useMemo(() => phoneVariants(leadPhone), [leadPhone]);
  const sendTo = useMemo(() => {
    const d = normalizeDigits(leadPhone);
    if (!d) return null;
    if (d.length === 10) return `91${d}`;
    return d;
  }, [leadPhone]);

  const mediaProxyBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-media`;

  const load = async () => {
    if (!variants.length) { setLoading(false); setMessages([]); setThreadId(null); return; }
    const { data: threads, error } = await supabase
      .from("whatsapp_threads")
      .select("id, wa_phone, last_message_at")
      .in("wa_phone", variants)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) console.warn("[lead-wa] thread load failed", error);
    const thread = threads?.[0];
    if (!thread) { setThreadId(null); setMessages([]); setLoading(false); return; }
    setThreadId(thread.id);

    const { data: msgs, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, text, received_at, payload, status, error, deleted_at, deleted_for_everyone")
      .eq("thread_id", thread.id)
      .order("received_at", { ascending: true });
    if (msgErr) console.warn("[lead-wa] messages load failed", msgErr);

    const visible = (msgs || []).filter((m: any) => !m.deleted_at || m.deleted_for_everyone);
    const mapped: ChatMsg[] = visible.map((m: any) => {
      const p = m.payload || {};
      const kind: string | undefined = p._media_kind || (p.image ? "image" : p.sticker ? "sticker" : p.video ? "video" : p.audio ? "audio" : p.document ? "document" : undefined);
      const mediaId: string | undefined = p._media_id || p.image?.id || p.sticker?.id || p.video?.id || p.audio?.id || p.document?.id;
      const template = extractSentTemplate(p) || undefined;
      const errText = (() => {
        const e: any = m.error;
        if (!e) return undefined;
        if (typeof e === "string") return e;
        if (Array.isArray(e)) return e.map((x: any) => x?.title || x?.message).filter(Boolean).join("; ") || undefined;
        return e?.title || e?.message || undefined;
      })();
      return {
        id: m.id,
        direction: (m.direction === "out" ? "out" : "in") as "in" | "out",
        text: m.text || "",
        at: m.received_at || undefined,
        status: m.status || undefined,
        error: errText,
        deletedForEveryone: !!m.deleted_for_everyone,
        ...(template ? { template } : {}),
        ...(kind && mediaId ? { mediaUrl: `${mediaProxyBase}?id=${encodeURIComponent(mediaId)}`, mediaKind: kind, mediaFilename: p._media_filename || p.document?.filename } : {}),
      };
    });
    setMessages(mapped);
    setLoading(false);

    // Resolve the definitions of every template that appears in this thread so
    // the bubbles can render the real preview instead of "[template] name".
    const names = mapped.map(m => m.template?.name).filter(Boolean) as string[];
    if (names.length) {
      resolveTemplateDefs(names).then(defs => setTemplateDefs(defs)).catch(() => {});
    }


    // Clear unread for this lead's thread only
    supabase.from("whatsapp_threads").update({ unread_count: 0 }).eq("id", thread.id).then(() => {});
    supabase.from("whatsapp_messages").update({ is_read: true }).eq("thread_id", thread.id).then(() => {});
  };

  useEffect(() => {
    setLoading(true);
    load();
    const channel = supabase
      .channel(`lead-wa-${variants.join("-") || "none"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_threads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants.join(",")]);

  useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !sendTo || sending) return;
    setSending(true);
    const tempId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: tempId, direction: "out", text, at: new Date().toISOString(), status: "sending" }]);
    setDraft("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          to: sendTo,
          type: "text",
          text,
          context: { module: "manual", messageKind: "lead_chat_reply" },
        },

        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw new Error((error as any).message || "Send failed");
      if (data && (data as any).ok === false) throw new Error((data as any).error || "Send failed");
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: "sent" } : m));
      load();
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: "failed", error: e instanceof Error ? e.message : "Send failed" } : m));
      toast({
        title: "WhatsApp send failed",
        description: e instanceof Error ? e.message : "Send failed",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  /**
   * Delete a message.
   * - "me": hides it from every clinic-side view (soft delete).
   * - "everyone": soft deletes it and marks it as revoked, so it renders as
   *   "This message was deleted" for everyone looking at the conversation.
   */
  const deleteMessage = async (msg: ChatMsg, scope: "me" | "everyone") => {
    // Optimistic UI
    setMessages(prev =>
      scope === "everyone"
        ? prev.map(m => (m.id === msg.id ? { ...m, deletedForEveryone: true, text: "", template: undefined, mediaUrl: undefined } : m))
        : prev.filter(m => m.id !== msg.id),
    );
    const { error } = await supabase
      .from("whatsapp_messages")
      .update({ deleted_at: new Date().toISOString(), deleted_for_everyone: scope === "everyone" })
      .eq("id", msg.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      load();
      return;
    }
    toast({
      title: scope === "everyone" ? "Message deleted for everyone" : "Message deleted for you",
      description:
        scope === "everyone"
          ? "The message now shows as deleted in the conversation."
          : "Only removed from your view.",
    });
    load();
  };



  const StatusIcon = ({ status }: { status?: string }) => {
    const s = (status || "").toLowerCase();
    if (s === "failed" || s === "undeliverable") return <AlertCircle size={11} className="text-destructive" />;
    if (s === "read") return <CheckCheck size={11} className="text-info" />;
    if (s === "delivered") return <CheckCheck size={11} className="opacity-70" />;
    if (s === "sent") return <Check size={11} className="opacity-70" />;
    if (s === "sending") return <Loader2 size={11} className="animate-spin opacity-70" />;
    return null;
  };

  if (!variants.length) {
    return (
      <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
        No valid phone number on this lead for WhatsApp.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <div className="h-7 w-7 rounded-full bg-success/10 text-success flex items-center justify-center">
          <MessageSquare size={13} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">{leadName || "Lead"}</p>
          <p className="text-[10px] text-muted-foreground truncate">{leadPhone}</p>
        </div>
      </div>

      <ScrollArea className="h-[300px]" ref={scrollRef as any}>
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-xs text-muted-foreground gap-2">
              <Loader2 size={13} className="animate-spin" /> Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-xs text-muted-foreground">
              No WhatsApp history with this number yet. Send a message to start.
            </div>
          ) : (
            messages.map(m => (
              <div key={m.id} className={cn("group flex items-start gap-1", m.direction === "out" ? "justify-end" : "justify-start")}>
                {m.direction === "out" && !m.deletedForEveryone && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Message options"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-1 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem className="text-xs gap-2" onClick={() => deleteMessage(m, "me")}>
                        <Trash2 size={13} /> Delete for me
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive" onClick={() => deleteMessage(m, "everyone")}>
                        <Ban size={13} /> Delete for everyone
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <div
                  className={cn(
                    "max-w-[78%] rounded-lg px-2.5 py-1.5 text-xs whitespace-pre-wrap break-words",
                    m.direction === "out" ? "bg-success/10 text-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {m.deletedForEveryone ? (
                    <p className="italic text-muted-foreground flex items-center gap-1">
                      <Ban size={11} /> This message was deleted
                    </p>
                  ) : (
                    <>
                      {m.mediaUrl && (m.mediaKind === "image" || m.mediaKind === "sticker") ? (
                        <img src={m.mediaUrl} alt="WhatsApp attachment" className="rounded mb-1 max-h-40 object-contain" loading="lazy" />
                      ) : m.mediaUrl ? (
                        <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="underline block mb-1">
                          {m.mediaFilename || `Open ${m.mediaKind || "attachment"}`}
                        </a>
                      ) : null}
                      {m.template ? (
                        <WhatsAppTemplateMessage
                          info={m.template}
                          def={templateDefs.get(m.template.name)}
                          fallbackText={m.text}
                        />
                      ) : (
                        m.text
                      )}
                    </>
                  )}
                  <div className="flex items-center justify-end gap-1 mt-0.5 text-[9px] text-muted-foreground">
                    {m.at ? new Date(m.at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                    {m.direction === "out" && !m.deletedForEveryone && <StatusIcon status={m.status} />}
                  </div>
                  {m.error && !m.deletedForEveryone && <p className="text-[9px] text-destructive mt-0.5">{m.error}</p>}
                </div>
                {m.direction === "in" && !m.deletedForEveryone && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Message options"
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-1 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      <DropdownMenuItem className="text-xs gap-2" onClick={() => deleteMessage(m, "me")}>
                        <Trash2 size={13} /> Delete for me
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive" onClick={() => deleteMessage(m, "everyone")}>
                        <Ban size={13} /> Delete for everyone
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 p-2 border-t border-border">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Type a WhatsApp message…"
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8" onClick={handleSend} disabled={!draft.trim() || sending}>
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
        </Button>
      </div>
    </div>
  );
};

export default LeadWhatsAppChat;
