import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { checkWhatsAppRecipient, NOT_ON_WHATSAPP_MESSAGE } from "@/lib/whatsappNumberCheck";

const GRAPH = "https://graph.facebook.com/v22.0";

type MetaTemplate = {
  name: string;
  status: string;
  category?: string;
  language: string;
};

/**
 * Pure client-side WhatsApp campaign UI.
 * No database. Credentials + templates live in local state only.
 * NOTE: Access tokens entered here are visible to anyone using the browser.
 */
export const WhatsAppQuickCampaign = () => {
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [recipient, setRecipient] = useState("");

  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);

  const approved = templates.filter(t => String(t.status).toUpperCase() === "APPROVED");

  const handleSync = async () => {
    if (!wabaId || !accessToken) {
      toast({ title: "Missing credentials", description: "WABA ID and access token are required.", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch(
        `${GRAPH}/${encodeURIComponent(wabaId)}/message_templates?fields=name,status,category,language&limit=200`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const body = await res.json();
      if (!res.ok || body?.error) {
        throw new Error(body?.error?.message || `Meta API error ${res.status}`);
      }
      const list: MetaTemplate[] = Array.isArray(body?.data) ? body.data : [];
      setTemplates(list);
      setSelectedTemplate("");
      toast({ title: "Templates synced", description: `${list.filter(t => String(t.status).toUpperCase() === "APPROVED").length} approved / ${list.length} total.` });
    } catch (err) {
      toast({ title: "Sync failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleSend = async () => {
    const tpl = approved.find(t => t.name === selectedTemplate);
    if (!tpl) {
      toast({ title: "Select an approved template", variant: "destructive" });
      return;
    }
    const to = recipient.trim().replace(/[^\d]/g, "");
    if (!to) {
      toast({ title: "Enter a recipient phone number (with country code)", variant: "destructive" });
      return;
    }
    // Pre-send WhatsApp number validation (format + auto-blacklisted 131026 numbers).
    const check = await checkWhatsAppRecipient(to);
    if (!check.ok) {
      toast({
        title: check.code === "blacklisted" ? NOT_ON_WHATSAPP_MESSAGE : "Invalid WhatsApp number",
        description: check.reason,
        variant: "destructive",
      });
      return;
    }

    if (!phoneNumberId || !accessToken) {
      toast({ title: "Missing credentials", description: "Phone Number ID and access token are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: { name: tpl.name, language: { code: tpl.language } },
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        throw new Error(body?.error?.message || `Meta API error ${res.status}`);
      }
      toast({ title: "Message sent", description: `ID: ${body?.messages?.[0]?.id ?? "unknown"}` });
    } catch (err) {
      toast({ title: "Send failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Quick Campaign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>WABA ID</Label>
            <Input value={wabaId} onChange={e => setWabaId(e.target.value)} placeholder="WhatsApp Business Account ID" />
          </div>
          <div className="space-y-1">
            <Label>Phone Number ID</Label>
            <Input value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} placeholder="From phone number ID" />
          </div>
          <div className="space-y-1">
            <Label>Access Token</Label>
            <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Meta access token" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync Templates
          </Button>
          {templates.length > 0 && (
            <Badge variant="secondary">{approved.length} approved / {templates.length} total</Badge>
          )}
        </div>

        <div className="space-y-1">
          <Label>Approved Template</Label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue placeholder={approved.length ? "Choose a template" : "Sync templates first"} />
            </SelectTrigger>
            <SelectContent>
              {approved.map(t => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name} · {t.language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Recipient Phone (with country code, digits only)</Label>
          <Input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="e.g. 919876543210"
            inputMode="tel"
          />
        </div>

        <Button onClick={handleSend} disabled={sending || !selectedTemplate || !recipient} className="w-full">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send Message
        </Button>
      </CardContent>
    </Card>
  );
};

export default WhatsAppQuickCampaign;
