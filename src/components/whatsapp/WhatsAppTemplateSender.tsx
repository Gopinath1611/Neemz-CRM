import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
import { checkWhatsAppRecipient, RecipientCheck } from "@/lib/whatsappNumberCheck";

const GRAPH = "https://graph.facebook.com/v22.0";

type MetaComponent = { type: string; text?: string; [k: string]: unknown };
type MetaTemplate = { name: string; status?: string; language?: string; components?: MetaComponent[] };

export const WhatsAppTemplateSender = () => {
  const [templatesJson, setTemplatesJson] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const [selectedName, setSelectedName] = useState("");
  const [recipient, setRecipient] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [sending, setSending] = useState(false);

  // Validation States
  const [isValidating, setIsValidating] = useState(false);
  const [recipientCheck, setRecipientCheck] = useState<RecipientCheck | null>(null);

  // Live validation as user types
  useEffect(() => {
    const trimmed = recipient.trim();
    if (!trimmed) {
      setRecipientCheck(null);
      setIsValidating(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await checkWhatsAppRecipient(trimmed);
        setRecipientCheck(result);
      } catch (err) {
        console.error("Validation error:", err);
      } finally {
        setIsValidating(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [recipient]);

  const templates = useMemo<MetaTemplate[]>(() => {
    if (!templatesJson.trim()) return [];
    try {
      const parsed = JSON.parse(templatesJson);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
      return arr as MetaTemplate[];
    } catch {
      return [];
    }
  }, [templatesJson]);

  const selected = templates.find((t) => t.name === selectedName);
  const bodyText = selected?.components?.find((c) => String(c.type).toUpperCase() === "BODY")?.text ?? "";
  const preview = bodyText.replace(/\{\{1\}\}/g, customerName || "{{1}}");

  const handleSend = async () => {
    if (!selected) return toast({ title: "Select a template", variant: "destructive" });
    const to = recipientCheck?.phone || recipient.trim().replace(/[^\d]/g, "");
    if (!to) return toast({ title: "Enter recipient phone number (with country code)", variant: "destructive" });

    if (recipientCheck && !recipientCheck.ok) {
      return toast({
        title: "Cannot send to this number",
        description: recipientCheck.reason || "Recipient is not on WhatsApp or blacklisted.",
        variant: "destructive",
      });
    }

    if (!customerName.trim()) return toast({ title: "Enter the customer name for {{1}}", variant: "destructive" });
    if (!phoneNumberId || !accessToken)
      return toast({ title: "Phone Number ID and access token are required", variant: "destructive" });

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
          template: {
            name: selected.name,
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: customerName.trim() }],
              },
            ],
          },
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) throw new Error(body?.error?.message || `Meta API error ${res.status}`);
      toast({ title: "Message sent", description: `ID: ${body?.messages?.[0]?.id ?? "unknown"}` });
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>WhatsApp Template Sender</span>
          {/* 🔍 Editor Work ஆகுதான்னு செக் பண்ண ஒரு டெம்ப்ரரி பட்டன்/பேட்ஜ் */}
          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
            Editor Test: Working
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>Meta templates response (paste JSON: full response or the `data` array)</Label>
          <Textarea
            value={templatesJson}
            onChange={(e) => setTemplatesJson(e.target.value)}
            placeholder='{"data":[{"name":"drneemz_welcome","language":"en","components":[{"type":"BODY","text":"Hi {{1}}, welcome!"}]}]}'
            className="min-h-[120px] font-mono text-xs"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Phone Number ID</Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="From phone number ID"
            />
          </div>
          <div className="space-y-1">
            <Label>Access Token</Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Meta access token"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Template</Label>
          <Select value={selectedName} onValueChange={setSelectedName}>
            <SelectTrigger>
              <SelectValue placeholder={templates.length ? "Choose a template" : "Paste templates JSON first"} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            {preview || <span className="text-muted-foreground">No BODY component found.</span>}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Recipient phone (with country code)</Label>
            <div className="relative">
              <Input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. 919876543210"
                inputMode="tel"
              />
              {isValidating && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Instant Validation Display */}
            {recipientCheck &&
              !isValidating &&
              (recipientCheck.ok ? (
                <p className="text-xs text-green-600 font-medium mt-1">Number validated — safe to send.</p>
              ) : (
                <p className="text-xs text-destructive font-medium mt-1">
                  {recipientCheck.reason || "Cannot send: Recipient is not on WhatsApp"}
                </p>
              ))}
          </div>

          <div className="space-y-1">
            <Label>Customer name (maps to {"{{1}}"})</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ravi"
              maxLength={100}
            />
          </div>
        </div>

        <Button
          onClick={handleSend}
          disabled={sending || !selected || (recipientCheck !== null && !recipientCheck.ok)}
          className="w-full"
        >
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send Message
        </Button>
      </CardContent>
    </Card>
  );
};

export default WhatsAppTemplateSender;
