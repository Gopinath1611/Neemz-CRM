import { useMemo, useState } from "react";
import { MessageSquare, CheckCheck, Check, AlertTriangle, RefreshCw, ExternalLink, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { Link } from "react-router-dom";

interface Thread {
  id: string;
  wa_phone: string;
  display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

interface Message {
  id: string;
  thread_id: string;
  direction: string;
  text: string | null;
  status: string | null;
  received_at: string;
  wa_message_id: string | null;
  deleted_for_everyone: boolean;
}

const stamp = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (isToday(d)) return format(d, "hh:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd MMM");
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

const StatusIcon = ({ status }: { status: string | null }) => {
  if (status === "read") return <CheckCheck size={12} className="text-primary" />;
  if (status === "delivered") return <CheckCheck size={12} className="text-muted-foreground" />;
  if (status === "failed") return <AlertTriangle size={12} className="text-destructive" />;
  if (status === "sent") return <Check size={12} className="text-muted-foreground" />;
  return null;
};

const Messages = () => {
  const [search, setSearch] = useState("");
  const [activeThread, setActiveThread] = useState<string | null>(null);

  const { data: threads = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["legacy-messages-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_threads")
        .select("id, wa_phone, display_name, last_message, last_message_at, unread_count")
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as Thread[];
    },
  });

  const selectedId = activeThread ?? threads[0]?.id ?? null;

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["legacy-messages-thread", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, thread_id, direction, text, status, received_at, wa_message_id, deleted_for_everyone")
        .eq("thread_id", selectedId as string)
        .is("deleted_at", null)
        .order("received_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as Message[];
    },
  });

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        (t.display_name || "").toLowerCase().includes(q) ||
        t.wa_phone.includes(q) ||
        (t.last_message || "").toLowerCase().includes(q),
    );
  }, [threads, search]);

  const selectedThread = threads.find((t) => t.id === selectedId) || null;
  const totalUnread = threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-display">Messages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live WhatsApp conversations from the WhatsApp Cloud API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link to="/clinic-whatsapp/inbox">
              <ExternalLink size={14} /> Full WhatsApp inbox
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Conversations */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <MessageSquare size={16} className="text-success" />
                Conversations
              </CardTitle>
              <Badge variant="secondary">
                {threads.length}
                {totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
              </Badge>
            </div>
            <div className="relative mt-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, number or message"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              {isLoading ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading conversations…</div>
              ) : filteredThreads.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No WhatsApp conversations yet
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredThreads.map((thread) => {
                    const name = thread.display_name || thread.wa_phone;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => setActiveThread(thread.id)}
                        className={`w-full text-left flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/30 ${
                          thread.id === selectedId ? "bg-secondary/50" : ""
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success font-semibold text-xs">
                          {initials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {stamp(thread.last_message_at)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {thread.last_message || "No messages"}
                          </p>
                        </div>
                        {thread.unread_count > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-success px-1.5 text-success-foreground text-xs font-bold">
                            {thread.unread_count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Message history */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-display">
              {selectedThread ? selectedThread.display_name || selectedThread.wa_phone : "Conversation"}
            </CardTitle>
            {selectedThread && (
              <p className="text-xs text-muted-foreground">{selectedThread.wa_phone}</p>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[560px]">
              <div className="space-y-3 px-5 py-4">
                {!selectedId ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Select a conversation to view its messages
                  </p>
                ) : messagesLoading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages in this conversation</p>
                ) : (
                  messages.map((msg) => {
                    const outbound = msg.direction === "out";
                    return (
                      <div key={msg.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 ${
                            outbound ? "bg-primary/10" : "bg-secondary"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.deleted_for_everyone
                              ? "This message was deleted"
                              : msg.text || "(no text content)"}
                          </p>
                          <div className="mt-1 flex items-center justify-end gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(msg.received_at), "dd MMM, hh:mm a")}
                            </span>
                            {outbound && <StatusIcon status={msg.status} />}
                            {outbound && msg.status === "failed" && (
                              <span className="text-[10px] text-destructive">failed</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Messages;
