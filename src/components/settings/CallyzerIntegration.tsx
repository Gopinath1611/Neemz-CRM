import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Copy,
  Loader2,
  PhoneCall,
  Plus,
  RefreshCw,
  Trash2,
  Link2,
  ShieldAlert,
} from "lucide-react";

type Settings = {
  id: string;
  environment: string;
  sandbox_base_url: string | null;
  production_base_url: string | null;
  sandbox_window_from: string | null;
  sandbox_window_to: string | null;
  sandbox_api_version: string | null;
  sandbox_history_path: string | null;
  sandbox_history_by_id_path: string | null;
  sandbox_daywise_path: string | null;
  production_api_version: string | null;
  production_history_path: string | null;
  production_history_by_id_path: string | null;
  production_daywise_path: string | null;
  webhook_secret: string | null;
  is_enabled: boolean;
  ignore_unmapped_employees: boolean;
  last_verified_at: string | null;
  last_verify_error: string | null;
  last_webhook_at: string | null;
  last_backfill_at: string | null;
};

type Mapping = {
  id: string;
  callyzer_emp_number: string;
  callyzer_emp_name: string | null;
  profile_id: string | null;
  employee_id: string | null;
  is_active: boolean;
};

type WebhookLog = {
  id: string;
  received_at: string;
  status: string;
  message: string | null;
  environment: string | null;
  logs_received: number;
  logs_inserted: number;
  logs_updated: number;
  logs_skipped: number;
  unknown_call_types: string[] | null;
  payload: unknown;
};

type Unmatched = {
  id: string;
  call_log_id: string | null;
  phone: string | null;
  normalized_phone: string | null;
  callyzer_emp_number: string | null;
  environment: string | null;
  resolved: boolean;
  created_at: string;
};

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const fnUrl = (name: string) => `https://${PROJECT_ID}.supabase.co/functions/v1/${name}`;

const statusTone = (s: string) =>
  s === "ok" ? "default" : s === "partial" ? "secondary" : "destructive";

const CallyzerIntegration = () => {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin" as never);
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; full_name: string | null }[]>([]);
  const [newEmp, setNewEmp] = useState({ number: "", name: "", profile_id: "", employee_id: "" });

  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});

  const [backfill, setBackfill] = useState({ start: "2026-09-19", end: "2026-10-03" });
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [backfillPreview, setBackfillPreview] = useState<any | null>(null);

  const [reprocessBusy, setReprocessBusy] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<string | null>(null);
  const [reprocessPreview, setReprocessPreview] = useState<any | null>(null);

  const [compareBusy, setCompareBusy] = useState(false);
  const [compare, setCompare] = useState<any | null>(null);

  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, m, p, e, l, u] = await Promise.all([
      supabase.from("callyzer_settings").select("*").limit(1).maybeSingle(),
      supabase.from("callyzer_employee_mappings").select("*").order("callyzer_emp_number"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("employees").select("id, full_name").order("full_name"),
      supabase
        .from("callyzer_webhook_logs")
        .select("*")
        .order("received_at", { ascending: false })
        .limit(50),
      supabase
        .from("callyzer_unmatched_calls")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    setSettings((s.data as Settings) ?? null);
    setMappings((m.data as Mapping[]) ?? []);
    setProfiles((p.data as never[]) ?? []);
    setEmployees((e.data as never[]) ?? []);
    setLogs((l.data as WebhookLog[]) ?? []);
    setUnmatched((u.data as Unmatched[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin]);

  const webhookUrl = useMemo(() => {
    const token = settings?.webhook_secret;
    return token ? `${fnUrl("callyzer-webhook")}?token=${token}` : fnUrl("callyzer-webhook");
  }, [settings?.webhook_secret]);

  const patch = (p: Partial<Settings>) =>
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("callyzer_settings")
      .update({
        environment: settings.environment,
        sandbox_base_url: settings.sandbox_base_url,
        production_base_url: settings.production_base_url,
        sandbox_window_from: settings.sandbox_window_from,
        sandbox_window_to: settings.sandbox_window_to,
        sandbox_api_version: settings.sandbox_api_version,
        sandbox_history_path: settings.sandbox_history_path,
        sandbox_history_by_id_path: settings.sandbox_history_by_id_path,
        sandbox_daywise_path: settings.sandbox_daywise_path,
        production_api_version: settings.production_api_version,
        production_history_path: settings.production_history_path,
        production_history_by_id_path: settings.production_history_by_id_path,
        production_daywise_path: settings.production_daywise_path,
        webhook_secret: settings.webhook_secret,
        is_enabled: settings.is_enabled,
        ignore_unmapped_employees: settings.ignore_unmapped_employees,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else toast({ title: "Callyzer settings saved" });
  };

  const genSecret = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    patch({
      webhook_secret: Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    });
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: "Copied" });
  };

  const addMapping = async () => {
    if (!newEmp.number.trim()) {
      toast({ title: "Callyzer employee number required", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("callyzer_employee_mappings").insert({
      callyzer_emp_number: newEmp.number.trim(),
      callyzer_emp_name: newEmp.name.trim() || null,
      profile_id: newEmp.profile_id || null,
      employee_id: newEmp.employee_id || null,
    });
    if (error) toast({ title: "Could not add", description: error.message, variant: "destructive" });
    else {
      setNewEmp({ number: "", name: "", profile_id: "", employee_id: "" });
      void load();
    }
  };

  const updateMapping = async (id: string, p: Partial<Mapping>) => {
    setMappings((prev) => prev.map((m) => (m.id === id ? { ...m, ...p } : m)));
    const { error } = await supabase.from("callyzer_employee_mappings").update(p).eq("id", id);
    if (error) toast({ title: "Could not update", description: error.message, variant: "destructive" });
  };

  const removeMapping = async (id: string) => {
    const { error } = await supabase.from("callyzer_employee_mappings").delete().eq("id", id);
    if (error) toast({ title: "Could not delete", description: error.message, variant: "destructive" });
    else void load();
  };

  const callFn = async (name: string, body: unknown) => {
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch(fnUrl(name), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sess.session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const runBackfill = async (dryRun: boolean) => {
    setBackfillBusy(true);
    setBackfillResult(null);
    if (dryRun) setBackfillPreview(null);
    const { ok, json } = await callFn("callyzer-backfill", {
      startDate: backfill.start,
      endDate: backfill.end,
      dryRun,
    });
    setBackfillBusy(false);
    if (!ok) {
      setBackfillPreview(null);
      setBackfillResult(
        `Failed: ${json.error ?? "unknown error"}${json.url ? ` (tried ${json.url})` : ""}${json.detail ? ` — ${json.detail}` : ""}`,
      );
      return;
    }
    const line =
      `Received ${json.received}, to insert ${json.inserted}, to update ${json.updated}, skipped ${json.skipped}, ignored ${json.ignored ?? 0}.`;
    if (dryRun) {
      setBackfillPreview({ ...json, range: `${backfill.start} → ${backfill.end}` });
      setBackfillResult(`Preview only — nothing written. ${line}`);
      return;
    }
    setBackfillPreview(null);
    setBackfillResult(
      `Saved. Received ${json.received}, inserted ${json.inserted}, updated ${json.updated}, skipped ${json.skipped}.`,
    );
    void load();
  };

  const runReprocess = async (dryRun: boolean) => {
    setReprocessBusy(true);
    setReprocessResult(null);
    if (dryRun) setReprocessPreview(null);
    const { ok, json } = await callFn("callyzer-reprocess", { dryRun });
    setReprocessBusy(false);
    if (!ok) {
      setReprocessPreview(null);
      setReprocessResult(`Failed: ${json.error ?? "unknown error"}`);
      return;
    }
    const line = `${json.logs ?? 0} stored payload(s): found ${json.received ?? 0}, insert ${json.inserted ?? 0}, update ${json.updated ?? 0}, skip ${json.skipped ?? 0}, ignore ${json.ignored ?? 0}.`;
    if (dryRun) {
      setReprocessPreview(json);
      setReprocessResult(`Preview only — nothing written. ${line}`);
      return;
    }
    setReprocessPreview(null);
    setReprocessResult(`Saved. ${line}`);
    void load();
  };

  const runCompare = async () => {
    setCompareBusy(true);
    const { json } = await callFn("callyzer-compare", {});
    setCompareBusy(false);
    setCompare(json);
  };

  const runVerify = async () => {
    setVerifyBusy(true);
    setVerifyResult(null);
    const { ok, json } = await callFn("callyzer-verify", {});
    setVerifyBusy(false);
    setVerifyResult({ ...json, ok: json.ok ?? ok });
    void load();
  };

  const linkUnmatched = async (row: Unmatched) => {
    const val = linkTargets[row.id];
    if (!val || !row.call_log_id) return;
    const [kind, id] = val.split(":");
    const patchRow =
      kind === "telecaller"
        ? { telecaller_id: id, manually_assigned: true }
        : kind === "lead"
          ? { lead_id: id, manually_assigned: true, match_method: "manual" }
          : { patient_id: id, manually_assigned: true, match_method: "manual" };
    const { error } = await supabase.from("call_logs").update(patchRow).eq("id", row.call_log_id);
    if (error) {
      toast({ title: "Could not link", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("callyzer_unmatched_calls").update({ resolved: true }).eq("id", row.id);
    toast({ title: "Call linked" });
    void load();
  };

  if (!isAdmin) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <ShieldAlert size={16} /> Callyzer integration settings are available to admins only.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" /> Loading Callyzer settings…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-display flex items-center gap-2">
            <PhoneCall size={16} /> Callyzer Call Tracking
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Enabled
            <Switch
              checked={!!settings?.is_enabled}
              onCheckedChange={(v) => patch({ is_enabled: v })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Ignore calls from unmapped Callyzer employees</p>
              <p className="text-[11px] text-muted-foreground">
                On: calls from Callyzer numbers with no staff mapping are not saved to Call Logs —
                only the number and a count are noted in the webhook logs. Applies to live calls and
                backfill.
              </p>
            </div>
            <Switch
              checked={settings?.ignore_unmapped_employees !== false}
              onCheckedChange={(v) => patch({ ignore_unmapped_employees: v })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <Select
                value={settings?.environment ?? "sandbox"}
                onValueChange={(v) => patch({ environment: v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (test mode)</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Webhook token</Label>
              <div className="flex gap-2">
                <Input
                  className="h-9 text-sm font-mono"
                  value={settings?.webhook_secret ?? ""}
                  onChange={(e) => patch({ webhook_secret: e.target.value })}
                  placeholder="Generate or paste a token"
                />
                <Button variant="outline" size="sm" className="h-9" onClick={genSecret}>
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sandbox base URL</Label>
              <Input
                className="h-9 text-sm font-mono"
                value={settings?.sandbox_base_url ?? ""}
                onChange={(e) => patch({ sandbox_base_url: e.target.value })}
                placeholder="https://sandbox.api.callyzer.co"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Production base URL</Label>
              <Input
                className="h-9 text-sm font-mono"
                value={settings?.production_base_url ?? ""}
                onChange={(e) => patch({ production_base_url: e.target.value })}
                placeholder="https://api1.callyzer.co"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sandbox data available from</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={(settings?.sandbox_window_from ?? "").slice(0, 10)}
                onChange={(e) => patch({ sandbox_window_from: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sandbox data available to</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={(settings?.sandbox_window_to ?? "").slice(0, 10)}
                onChange={(e) => patch({ sandbox_window_to: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Sandbox only serves calls inside this range. All sandbox requests are limited to it.
                Production is not affected.
              </p>
            </div>
          </div>

          {/* Per-environment API version + endpoint paths */}
          {(["sandbox", "production"] as const).map((env) => {
            const vk = `${env}_api_version` as keyof Settings;
            const hpk = `${env}_history_path` as keyof Settings;
            const hbk = `${env}_history_by_id_path` as keyof Settings;
            const dpk = `${env}_daywise_path` as keyof Settings;
            const dv = env === "sandbox" ? "v2.1" : "v2.2";
            return (
              <div key={env} className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-medium capitalize">{env} API (default {dv})</p>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-[11px]">API version</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={(settings?.[vk] as string) ?? ""}
                      onChange={(e) => patch({ [vk]: e.target.value } as Partial<Settings>)}
                      placeholder={dv}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">History path</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={(settings?.[hpk] as string) ?? ""}
                      onChange={(e) => patch({ [hpk]: e.target.value } as Partial<Settings>)}
                      placeholder="/call-log/history"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">History-by-id path</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={(settings?.[hbk] as string) ?? ""}
                      onChange={(e) => patch({ [hbk]: e.target.value } as Partial<Settings>)}
                      placeholder="/call-log/history-by-id"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Day-wise analytics path</Label>
                    <Input
                      className="h-8 text-xs font-mono"
                      value={(settings?.[dpk] as string) ?? ""}
                      onChange={(e) => patch({ [dpk]: e.target.value } as Partial<Settings>)}
                      placeholder="/call-log/daywise-analytics"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Full URL: {(env === "sandbox" ? settings?.sandbox_base_url : settings?.production_base_url) || "<base>"}
                  /api/{(settings?.[vk] as string) || dv}
                  {(settings?.[hpk] as string) || "/call-log/history"}
                </p>
              </div>
            );
          })}

          <div className="space-y-1.5">
            <Label className="text-xs">Webhook URL — paste this in Callyzer → Connectors → Webhook</Label>
            <div className="flex gap-2">
              <Input readOnly className="h-9 text-sm font-mono" value={webhookUrl} />
              <Button variant="outline" size="sm" className="h-9" onClick={() => copy(webhookUrl)}>
                <Copy size={13} className="mr-1" /> Copy
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={saveSettings} disabled={saving}>
              {saving && <Loader2 size={13} className="mr-1 animate-spin" />} Save settings
            </Button>
            <Button variant="outline" size="sm" onClick={runVerify} disabled={verifyBusy}>
              {verifyBusy && <Loader2 size={13} className="mr-1 animate-spin" />} Verify Connection
            </Button>
            <span className="text-xs text-muted-foreground">
              Last webhook:{" "}
              {settings?.last_webhook_at
                ? new Date(settings.last_webhook_at).toLocaleString("en-IN")
                : "never"}
            </span>
            <span className="text-xs text-muted-foreground">
              Last verified:{" "}
              {settings?.last_verified_at
                ? new Date(settings.last_verified_at).toLocaleString("en-IN")
                : "never"}
            </span>
          </div>

          {verifyResult && (
            <div
              className={`rounded-md border p-3 text-xs space-y-1.5 ${
                verifyResult.ok
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <p className={`font-medium ${verifyResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                {verifyResult.ok
                  ? `Connected (${verifyResult.environment ?? settings?.environment}) — HTTP ${verifyResult.status}`
                  : `Connection failed (${verifyResult.environment ?? settings?.environment})`}
              </p>
              {verifyResult.error && <p className="text-destructive">{verifyResult.error}</p>}
              {verifyResult.url && (
                <p className="font-mono break-all">
                  <span className="text-muted-foreground">URL tried: </span>
                  {verifyResult.url}
                </p>
              )}
              {verifyResult.status != null && (
                <p className="font-mono">
                  <span className="text-muted-foreground">HTTP status: </span>
                  {verifyResult.status}
                </p>
              )}
              {verifyResult.body && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Callyzer response body:</p>
                  <pre className="font-mono whitespace-pre-wrap break-all rounded bg-muted p-2 max-h-40 overflow-auto">
                    {verifyResult.body}
                  </pre>
                </div>
              )}
            </div>
          )}
          {!verifyResult?.ok && settings?.last_verify_error && !verifyResult && (
            <p className="text-xs text-destructive font-mono break-all">
              Last verify error: {settings.last_verify_error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            The API token is stored as a backend secret (CALLYZER_API_TOKEN_SANDBOX /
            CALLYZER_API_TOKEN_PROD), never in the browser.
          </p>
        </CardContent>
      </Card>

      {/* Employee mapping */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-display">Telecaller mapping</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Map each Callyzer employee number to a DENZO staff member. The staff profile is written to
            the call log's telecaller field. Linking an employee record is optional.
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] items-end">
            <div className="space-y-1">
              <Label className="text-xs">Callyzer number</Label>
              <Input
                className="h-9 text-sm"
                value={newEmp.number}
                onChange={(e) => setNewEmp({ ...newEmp, number: e.target.value })}
                placeholder="9998875555"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Callyzer name</Label>
              <Input
                className="h-9 text-sm"
                value={newEmp.name}
                onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">DENZO staff (profile)</Label>
              <Select
                value={newEmp.profile_id}
                onValueChange={(v) => setNewEmp({ ...newEmp, profile_id: v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Employee record (optional)</Label>
              <Select
                value={newEmp.employee_id}
                onValueChange={(v) => setNewEmp({ ...newEmp, employee_id: v })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name || e.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-9" onClick={addMapping}>
              <Plus size={13} className="mr-1" /> Add
            </Button>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1.4fr_0.6fr_auto] gap-3 px-3 py-2 bg-muted/40 text-[11px] uppercase text-muted-foreground">
              <span>Callyzer number</span>
              <span>Callyzer name</span>
              <span>DENZO staff</span>
              <span>Active</span>
              <span />
            </div>
            {mappings.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground">No mappings yet.</p>
            )}
            {mappings.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[1fr_1fr_1.4fr_0.6fr_auto] gap-3 items-center px-3 py-2 border-t border-border text-sm"
              >
                <span className="font-mono text-xs">{m.callyzer_emp_number}</span>
                <span className="text-xs">{m.callyzer_emp_name || "—"}</span>
                <Select
                  value={m.profile_id ?? ""}
                  onValueChange={(v) => updateMapping(m.id, { profile_id: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={m.is_active}
                  onCheckedChange={(v) => updateMapping(m.id, { is_active: v })}
                  className="scale-75"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeMapping(m.id)}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Backfill */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-display">Backfill call logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={backfill.start}
                onChange={(e) => setBackfill({ ...backfill, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={backfill.end}
                onChange={(e) => setBackfill({ ...backfill, end: e.target.value })}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => void runBackfill(true)}
              disabled={backfillBusy}
            >
              {backfillBusy ? (
                <Loader2 size={13} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={13} className="mr-1" />
              )}
              Preview
            </Button>
          </div>
          {backfillResult && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{backfillResult}</p>
          )}
          {backfillPreview && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium">Preview for {backfillPreview.range}</p>
              <div className="grid grid-cols-5 gap-2 text-xs">
                <span>Found: {backfillPreview.received ?? 0}</span>
                <span>Will insert: {backfillPreview.inserted ?? 0}</span>
                <span>Will update: {backfillPreview.updated ?? 0}</span>
                <span>Will skip: {backfillPreview.skipped ?? 0}</span>
                <span>Will ignore: {backfillPreview.ignored ?? 0}</span>
              </div>
              {backfillPreview.employees?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2 font-medium">Employee</th>
                        <th className="py-1 pr-2 font-medium">Number</th>
                        <th className="py-1 pr-2 font-medium">Mapped</th>
                        <th className="py-1 pr-2 font-medium">Calls</th>
                        <th className="py-1 pr-2 font-medium">Insert</th>
                        <th className="py-1 pr-2 font-medium">Update</th>
                        <th className="py-1 pr-2 font-medium">Skip</th>
                        <th className="py-1 font-medium">Ignore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backfillPreview.employees.map((e: any, i: number) => (
                        <tr key={`${e.empNumber ?? "x"}-${i}`} className="border-t border-border/60">
                          <td className="py-1 pr-2">{e.empName || "—"}</td>
                          <td className="py-1 pr-2">{e.empNumber || "—"}</td>
                          <td className="py-1 pr-2">{e.mapped ? "Yes" : "No"}</td>
                          <td className="py-1 pr-2">{e.found ?? 0}</td>
                          <td className="py-1 pr-2">{e.inserted ?? 0}</td>
                          <td className="py-1 pr-2">{e.updated ?? 0}</td>
                          <td className="py-1 pr-2">{e.skipped ?? 0}</td>
                          <td className="py-1">{e.ignored ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {backfillPreview.unknownCallTypes?.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Unknown call types kept as-is: {backfillPreview.unknownCallTypes.join(", ")}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" className="h-8" onClick={() => void runBackfill(false)} disabled={backfillBusy}>
                  Confirm and save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setBackfillPreview(null);
                    setBackfillResult(null);
                  }}
                  disabled={backfillBusy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Uses the same dedupe rules as the live webhook, so running it twice does not duplicate
            calls.
          </p>
        </CardContent>
      </Card>

      {/* Reprocess stored webhook payloads */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-display">Reprocess partial webhook logs</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => void runReprocess(true)}
            disabled={reprocessBusy}
          >
            {reprocessBusy ? (
              <Loader2 size={13} className="mr-1 animate-spin" />
            ) : (
              <RefreshCw size={13} className="mr-1" />
            )}
            Preview
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Runs the stored payloads of logs marked partial or error through the current parser.
            Nothing is deleted, and the same dedupe rules apply, so it never creates duplicates.
          </p>
          {reprocessResult && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{reprocessResult}</p>
          )}
          {reprocessPreview && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium">
                Preview — {reprocessPreview.logs ?? 0} stored payload(s)
              </p>
              <div className="grid grid-cols-5 gap-2 text-xs">
                <span>Found: {reprocessPreview.received ?? 0}</span>
                <span>Will insert: {reprocessPreview.inserted ?? 0}</span>
                <span>Will update: {reprocessPreview.updated ?? 0}</span>
                <span>Will skip: {reprocessPreview.skipped ?? 0}</span>
                <span>Will ignore: {reprocessPreview.ignored ?? 0}</span>
              </div>
              {reprocessPreview.employees?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-2 font-medium">Employee</th>
                        <th className="py-1 pr-2 font-medium">Number</th>
                        <th className="py-1 pr-2 font-medium">Mapped</th>
                        <th className="py-1 pr-2 font-medium">Calls</th>
                        <th className="py-1 pr-2 font-medium">Insert</th>
                        <th className="py-1 pr-2 font-medium">Update</th>
                        <th className="py-1 pr-2 font-medium">Skip</th>
                        <th className="py-1 font-medium">Ignore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reprocessPreview.employees.map((e: any, i: number) => (
                        <tr key={`${e.empNumber ?? "x"}-${i}`} className="border-t border-border/60">
                          <td className="py-1 pr-2">{e.empName || "—"}</td>
                          <td className="py-1 pr-2">{e.empNumber || "—"}</td>
                          <td className="py-1 pr-2">{e.mapped ? "Yes" : "No"}</td>
                          <td className="py-1 pr-2">{e.found ?? 0}</td>
                          <td className="py-1 pr-2">{e.inserted ?? 0}</td>
                          <td className="py-1 pr-2">{e.updated ?? 0}</td>
                          <td className="py-1 pr-2">{e.skipped ?? 0}</td>
                          <td className="py-1">{e.ignored ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {reprocessPreview.reasons?.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Still not understood: {reprocessPreview.reasons.join(" | ")}
                </p>
              )}
              {reprocessPreview.unknownCallTypes?.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Unknown call types kept as-is: {reprocessPreview.unknownCallTypes.join(", ")}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => void runReprocess(false)}
                  disabled={reprocessBusy}
                >
                  Confirm and save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setReprocessPreview(null);
                    setReprocessResult(null);
                  }}
                  disabled={reprocessBusy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compare */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-display">Callyzer vs CRM (last 7 days)</CardTitle>
          <Button variant="outline" size="sm" onClick={runCompare} disabled={compareBusy}>
            {compareBusy && <Loader2 size={13} className="mr-1 animate-spin" />} Check
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!compare && <p className="text-xs text-muted-foreground">Not checked yet.</p>}
          {compare?.apiError && (
            <p className="text-xs text-destructive">Callyzer side: {compare.apiError}</p>
          )}
          {compare?.days?.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden text-sm">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase text-muted-foreground">
                <span>Date</span>
                <span>CRM total</span>
                <span>From Callyzer</span>
                <span>Difference</span>
              </div>
              {compare.days.map((d: any) => (
                <div key={d.date} className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-border text-xs">
                  <span>{d.date}</span>
                  <span>{d.crmTotal}</span>
                  {d.outsideWindow ? (
                    <span className="col-span-2 text-muted-foreground">outside sandbox window</span>
                  ) : (
                    <>
                      <span>{d.callyzerTotal ?? "—"}</span>
                      <span>{d.difference ?? "—"}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unmatched calls */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-display">
            Unmatched calls{" "}
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {unmatched.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {unmatched.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing pending.</p>
          )}
          {unmatched.map((row) => (
            <div
              key={row.id}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_1.6fr_auto] items-end rounded-md border border-border p-3"
            >
              <div className="text-xs">
                <p className="font-medium">{row.phone || row.normalized_phone || "No number"}</p>
                <p className="text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                Callyzer staff: {row.callyzer_emp_number || "—"}
                <br />
                {row.environment}
              </div>
              <Select
                value={linkTargets[row.id] ?? ""}
                onValueChange={(v) => setLinkTargets((p) => ({ ...p, [row.id]: v }))}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Link to staff member" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={`telecaller:${p.id}`}>
                      Staff: {p.full_name || p.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-9" onClick={() => linkUnmatched(row)}>
                <Link2 size={13} className="mr-1" /> Link
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Webhook logs */}
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-display">Webhook logs (admin only)</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw size={13} className="mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.length === 0 && (
            <p className="text-xs text-muted-foreground">No webhook events received yet.</p>
          )}
          {logs.map((l) => (
            <div key={l.id} className="rounded-md border border-border p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={statusTone(l.status) as never} className="text-[10px]">
                  {l.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(l.received_at).toLocaleString("en-IN")}
                </span>
                <span className="text-muted-foreground">
                  received {l.logs_received} · inserted {l.logs_inserted} · updated {l.logs_updated} ·
                  skipped {l.logs_skipped}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs ml-auto"
                  onClick={() => setOpenLog(openLog === l.id ? null : l.id)}
                >
                  {openLog === l.id ? "Hide payload" : "View payload"}
                </Button>
              </div>
              {l.message && <p className="text-xs text-muted-foreground">{l.message}</p>}
              {openLog === l.id && (
                <Textarea
                  readOnly
                  className="font-mono text-[11px] h-40"
                  value={JSON.stringify(l.payload, null, 2)}
                />
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Payload history is kept for 30 days and purged automatically.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CallyzerIntegration;
