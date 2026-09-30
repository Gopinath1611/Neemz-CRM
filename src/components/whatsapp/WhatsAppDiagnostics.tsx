import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";

type Diagnostic = {
  ok: boolean;
  error?: string;
  tokenDebug?: any;
  environment?: any;
  request?: any;
  response?: any;
  wamid?: string | null;
};

const PIPELINE = ["accepted", "sent", "delivered", "read"] as const;
type StatusStep = typeof PIPELINE[number] | "failed";

const rootCauseFor = (
  response: any,
  observed: Set<string>,
  waited: boolean,
): { verdict: "success" | "failed" | "stuck" | "http_error"; message: string; fix: string } => {
  const err = response?.error;
  if (err) {
    const code = err.code;
    const map: Record<number, string> = {
      131030: "Recipient not in the app's allowed test recipients. Add the number in Meta App > WhatsApp > API Setup > Recipient phone number.",
      131056: "Business phone number pair not registered. Register the sender in WhatsApp Manager.",
      131026: "Recipient is not a valid WhatsApp user (or cannot receive messages).",
      131047: "Re-engagement outside 24h window. Use an approved template instead of text.",
      132001: "Template not found / not approved in this language.",
      132000: "Template parameter count mismatch.",
    };
    return {
      verdict: "http_error",
      message: `Meta error ${code}: ${err.message || "unknown"}${err.fbtrace_id ? ` (fbtrace_id ${err.fbtrace_id})` : ""}`,
      fix: map[code] || "Check the Meta error code in the response and the fbtrace_id with Meta support.",
    };
  }
  if (observed.has("failed")) {
    return { verdict: "failed", message: "Webhook reported failed status.", fix: "See the error object attached to the failed status event." };
  }
  if (observed.has("delivered") || observed.has("read")) {
    return {
      verdict: "success",
      message: "Delivery pipeline reached delivered/read. Meta is delivering plain sends fine — the production failure is caused by the IMAGE header content (sample header_handle URLs or unreachable image link).",
      fix: "In production, replace the header image link with a permanent public JPEG/PNG on your own CDN, or upload via POST /{PNID}/media and pass {image:{id:'<mediaId>'}}. Never reuse Meta template header_handle sample URLs for real sends.",
    };
  }
  if (waited && observed.size <= 1) {
    return {
      verdict: "stuck",
      message: "Message was accepted by Meta but no sent/delivered/read event arrived within 90s.",
      fix: "Webhook likely not receiving statuses. In Meta App > WhatsApp > Configuration > Webhooks, set the callback URL to the whatsapp-webhook function and subscribe the 'messages' field (which includes statuses).",
    };
  }
  return { verdict: "success", message: "In progress.", fix: "" };
};

const StatusChip = ({ label, on }: { label: string; on: boolean }) => (
  <Badge variant={on ? "default" : "outline"} className={on ? "" : "opacity-50"}>
    {on ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
    {label}
  </Badge>
);

export default function WhatsAppDiagnostics() {
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"hello_world" | "text">("hello_world");
  const [text, setText] = useState("Diagnostic test from Lovable.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Diagnostic | null>(null);
  const [observed, setObserved] = useState<Set<string>>(new Set());
  const [failInfo, setFailInfo] = useState<any>(null);
  const [waitLeft, setWaitLeft] = useState(0);
  const [waited, setWaited] = useState(false);
  const timerRef = useRef<number | null>(null);

  const wamid = result?.wamid || null;

  useEffect(() => {
    if (!wamid) return;
    setObserved(new Set(["accepted"]));
    setFailInfo(null);
    setWaited(false);
    setWaitLeft(90);

    const channel = supabase
      .channel(`diag-${wamid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages", filter: `wa_message_id=eq.${wamid}` },
        (payload: any) => {
          const row = payload.new || payload.record;
          if (!row) return;
          const s = String(row.status || "").toLowerCase();
          if (s) setObserved((prev) => new Set([...prev, s]));
          if (s === "failed" && row.error) setFailInfo(row.error);
        },
      )
      .subscribe();

    // countdown
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const left = Math.max(0, 90 - Math.floor((Date.now() - started) / 1000));
      setWaitLeft(left);
      if (left === 0) {
        setWaited(true);
        if (timerRef.current) window.clearInterval(timerRef.current);
      }
    }, 500);

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [wamid]);

  const run = async () => {
    setLoading(true);
    setResult(null);
    setObserved(new Set());
    setFailInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-diagnostic", {
        body: { to, mode, text },
      });
      if (error) {
        setResult({ ok: false, error: error.message });
      } else {
        setResult(data as Diagnostic);
      }
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const verdict = useMemo(() => {
    if (!result?.ok || !result.response) return null;
    return rootCauseFor(result.response, observed, waited);
  }, [result, observed, waited]);

  const td = result?.tokenDebug;
  const env = result?.environment;
  const resp = result?.response;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Diagnostic Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Recipient (E.164, digits only)</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))}
                placeholder="919841494199"
              />
            </div>
            <div>
              <Label className="mb-2 block">Mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="flex gap-6">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="hello_world" id="hw" />
                  <Label htmlFor="hw">hello_world template</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="text" id="tx" />
                  <Label htmlFor="tx">Plain text</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          {mode === "text" && (
            <div>
              <Label>Text body</Label>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
              <p className="text-xs text-muted-foreground mt-1">
                Plain text works only inside a 24h customer service window.
              </p>
            </div>
          )}
          <Button onClick={run} disabled={loading || !to}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Running…</> : "Run Diagnostic"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uses PNID 777081605497413. No image, header, media, document, or button components are sent.
          </p>
        </CardContent>
      </Card>

      {result?.error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive flex gap-2">
            <XCircle className="h-4 w-4 mt-0.5" /> {result.error}
          </CardContent>
        </Card>
      )}

      {result?.ok && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">1. Token Validation (debug_token)</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex gap-2 items-center">
                {td?.isValid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                <span>is_valid: <b>{String(!!td?.isValid)}</b></span>
              </div>
              <div>type: {td?.type ?? "—"} · app_id: {td?.appId ?? "—"} · user_id: {td?.userId ?? "—"}</div>
              <div>expires_at: {td?.expiresAtIso ?? "—"} {td?.expiresInDays != null && td.expiresAtIso !== "never" ? `(in ${td.expiresInDays}d)` : ""}</div>
              <div>data_access_expires_at: {td?.dataAccessExpiresAt ?? "—"}</div>
              <div className="flex flex-wrap gap-1">
                <span className="text-muted-foreground">scopes:</span>
                {(td?.scopes || []).map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}
                {(!td?.scopes || td.scopes.length === 0) && <span className="text-muted-foreground">(none reported)</span>}
              </div>
              {td?.error && <div className="text-destructive">error: {JSON.stringify(td.error)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">2. Environment</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>PNID: <b>{env?.pnid}</b></div>
              <div>Display number: {env?.displayPhoneNumber ?? "—"} · Verified name: {env?.verifiedName ?? "—"}</div>
              <div>Quality: {env?.qualityRating ?? "—"} · Messaging tier: {env?.messagingLimitTier ?? "—"}</div>
              <div>WABA: {env?.wabaId ?? "—"} ({env?.wabaName ?? "—"})</div>
              <div className="flex items-center gap-2">
                Recipient E.164 valid: {env?.recipientE164Valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                <code>{env?.recipient}</code>
              </div>
              {Array.isArray(env?.registeredNumbers) && env.registeredNumbers.length > 0 && (
                <div className="mt-2">
                  <div className="text-muted-foreground">Registered senders on WABA:</div>
                  <ul className="list-disc pl-5">
                    {env.registeredNumbers.map((n: any) => (
                      <li key={n.id}>{n.display_phone_number} — {n.verified_name} (quality {n.quality_rating ?? "—"})</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. API Request</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-72">
{JSON.stringify(result.request, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">4. API Response</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">HTTP {resp?.httpStatus} {resp?.ok ? <Badge className="ml-1">ok</Badge> : <Badge variant="destructive">error</Badge>}</div>
              <div className="text-xs text-muted-foreground">
                x-fb-trace-id: <code>{resp?.headers?.xFbTraceId ?? "—"}</code> · x-fb-request-id: <code>{resp?.headers?.xFbRequestId ?? "—"}</code>
              </div>
              {resp?.headers?.xBusinessUseCaseUsage && (
                <div className="text-xs">
                  <div className="text-muted-foreground">x-business-use-case-usage:</div>
                  <pre className="bg-muted p-2 rounded overflow-auto max-h-40">
{JSON.stringify(resp.headers.xBusinessUseCaseUsage, null, 2)}
                  </pre>
                </div>
              )}
              {resp?.error && (
                <div className="text-sm text-destructive">
                  <b>Meta error {resp.error.code}:</b> {resp.error.message} {resp.error.fbtrace_id ? `(fbtrace ${resp.error.fbtrace_id})` : ""}
                </div>
              )}
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-72">
{JSON.stringify(resp?.body, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">5. Webhook / Delivery Status</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {wamid ? (
                <>
                  <div className="text-xs text-muted-foreground">wamid: <code>{wamid}</code></div>
                  <div className="flex flex-wrap gap-2">
                    {PIPELINE.map((s) => <StatusChip key={s} label={s} on={observed.has(s)} />)}
                    {observed.has("failed") && <Badge variant="destructive">failed</Badge>}
                  </div>
                  {!waited && <div className="text-xs text-muted-foreground">Waiting for webhook events… {waitLeft}s remaining</div>}
                  {waited && observed.size <= 1 && (
                    <div className="text-xs text-amber-600 flex gap-1"><AlertTriangle className="h-3 w-3 mt-0.5" />No status events received within 90 seconds.</div>
                  )}
                  {failInfo && (
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">{JSON.stringify(failInfo, null, 2)}</pre>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">No wamid returned; delivery pipeline not applicable.</div>
              )}
            </CardContent>
          </Card>

          {verdict && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">6. Verdict / Root Cause & Recommended Fix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {verdict.verdict === "success" ? (
                    <Badge className="bg-green-600">Success</Badge>
                  ) : (
                    <Badge variant="destructive">{verdict.verdict}</Badge>
                  )}
                </div>
                <div><b>Root cause:</b> {verdict.message}</div>
                {verdict.fix && <div><b>Recommended fix:</b> {verdict.fix}</div>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
