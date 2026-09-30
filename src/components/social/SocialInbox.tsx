import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send, Inbox, MessageSquare } from "lucide-react";

type SocialMessage = {
  id: string;
  platform: string;
  sender_name: string | null;
  message: string | null;
  message_type: string;
  status: string;
  created_at: string;
};

const SocialInbox = () => {
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("social_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setMessages((data as SocialMessage[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const active = messages.find((m) => m.id === activeId) || null;
  const thread = active
    ? messages
        .filter((m) => m.sender_name === active.sender_name && m.platform === active.platform)
        .slice()
        .reverse()
    : [];

  const handleSend = async () => {
    if (!active || !reply.trim()) return;
    setSending(true);
    const { error } = await supabase.from("social_messages").insert({
      platform: active.platform,
      sender_name: active.sender_name,
      message: reply.trim(),
      message_type: active.message_type,
      status: "replied",
    });
    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }
    await supabase.from("social_messages").update({ status: "replied" }).eq("id", active.id);
    setReply("");
    setSending(false);
    await load();
    toast.success("Reply sent");
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      <Card className="p-2">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Inbox size={13} /> Messages ({messages.length})
        </div>
        <ScrollArea className="h-[440px]">
          <div className="space-y-1">
            {loading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
            {!loading && messages.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">No messages yet.</p>
            )}
            {messages.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  activeId === m.id ? "bg-accent" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{m.sender_name || "Unknown"}</span>
                  {m.status === "unread" && <Badge variant="secondary" className="text-[10px]">New</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.message}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                  {m.platform} · {m.message_type}
                </p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      <Card className="flex flex-col h-[490px]">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <MessageSquare size={26} />
            <p className="text-sm">Select a message to view the conversation</p>
          </div>
        ) : (
          <>
            <div className="border-b px-4 py-3">
              <p className="text-sm font-semibold">{active.sender_name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {active.platform} · {active.message_type === "dm" ? "Direct Message" : "Comment"}
              </p>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {thread.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      m.status === "replied" && m.id !== active.id
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p>{m.message}</p>
                    <p className="text-[10px] opacity-70 mt-1">
                      {new Date(m.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="border-t p-3 flex items-center gap-2">
              <Input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your reply…"
              />
              <Button size="icon" onClick={handleSend} disabled={sending || !reply.trim()}>
                <Send size={15} />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default SocialInbox;
