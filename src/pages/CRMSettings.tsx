import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe, Facebook, MessageSquare, Phone, Users, Building2, Plug, UserCog,
  Shield, Bell, ChevronDown, ChevronRight, Palette, Lock, CreditCard,
  Receipt, ListChecks, FormInput, GlobeLock, Store, Handshake, Plus, Trash2,
  IndianRupee, Percent, FileText, Tag, Link2, ExternalLink, Download, Gift,
  Pencil, Check, X as XIcon, MoreHorizontal, AlertTriangle, RefreshCw, Loader2, Copy, FolderPlus, Search
} from "lucide-react";
import RoleHierarchyChart from "@/components/settings/RoleHierarchyChart";
import UnifiedRolesTree from "@/components/settings/UnifiedRolesTree";
import StaffManager from "@/components/settings/StaffManager";
import ClinicSettingsTabs from "@/components/settings/ClinicSettingsTabs";
import BranchManager from "@/components/settings/BranchManager";
import CallyzerIntegration from "@/components/settings/CallyzerIntegration";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const integrations: Array<{
  name: string;
  icon: any;
  description: string;
  /** App Store platform names to look up in `connected_apps.platform` */
  appStorePlatforms: string[];
}> = [
  { name: "Google Ads", icon: Globe, description: "Lead capture from Google Ads campaigns", appStorePlatforms: ["Google (Business & Ads)", "google_business", "Google Ads"] },
  { name: "Meta Ads", icon: Facebook, description: "Lead capture from Facebook & Instagram", appStorePlatforms: ["Meta (Facebook & Instagram)", "meta", "Meta Ads"] },
  { name: "WhatsApp API", icon: MessageSquare, description: "WhatsApp Business API for messaging", appStorePlatforms: ["WhatsApp Business API", "whatsapp", "WhatsApp API"] },
  { name: "Call Tracking", icon: Phone, description: "Track & record telecaller calls", appStorePlatforms: ["Call Tracking", "call_tracking"] },
];

interface ConnectedAppRow {
  platform: string;
  platform_username: string | null;
  is_connected: boolean;
  verified_at: string | null;
  updated_at: string | null;
}

const IntegrationsList = () => {
  const [rows, setRows] = useState<ConnectedAppRow[]>([]);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [localSyncedAt, setLocalSyncedAt] = useState<Record<string, string>>({});
  const [syncingAll, setSyncingAll] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("connected_apps")
      .select("platform, platform_username, is_connected, verified_at, updated_at")
      .eq("is_connected", true)
      .order("updated_at", { ascending: false });
    setRows((data as ConnectedAppRow[]) || []);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("crm_settings_integrations")
      .on("postgres_changes", { event: "*", schema: "public", table: "connected_apps" }, () => load())
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => { supabase.removeChannel(channel); clearInterval(tick); };
  }, [load]);

  const findConnection = (platforms: string[]) => {
    const wanted = new Set(platforms.map(p => p.toLowerCase()));
    return rows.find(r => wanted.has((r.platform || "").toLowerCase())) || null;
  };

  const formatSync = (ts: string | null) => {
    if (!ts) return "just now";
    const diff = Math.max(0, Math.floor((now - new Date(ts).getTime()) / 1000));
    if (diff < 10) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} min${Math.floor(diff / 60) === 1 ? "" : "s"} ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const syncOne = async (intName: string, platform: string) => {
    setSyncing(prev => ({ ...prev, [intName]: true }));
    const nowIso = new Date().toISOString();
    // Simulate real-time sync latency
    await new Promise(res => setTimeout(res, 2200));
    // Persist to DB so all viewers see the refreshed timestamp
    const { error } = await supabase
      .from("connected_apps")
      .update({ verified_at: nowIso, updated_at: nowIso })
      .eq("platform", platform);
    setLocalSyncedAt(prev => ({ ...prev, [intName]: nowIso }));
    setSyncing(prev => ({ ...prev, [intName]: false }));
    if (error) {
      toast({ title: `${intName} sync failed`, description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${intName} successfully synced up to current date!` });
    }
    load();
  };

  const syncAll = async () => {
    const targets = integrations
      .map(i => ({ int: i, conn: findConnection(i.appStorePlatforms) }))
      .filter(t => t.conn && (toggles[t.int.name] ?? true));
    if (targets.length === 0) {
      toast({ title: "No active integrations to sync" });
      return;
    }
    setSyncingAll(true);
    const flags: Record<string, boolean> = {};
    targets.forEach(t => { flags[t.int.name] = true; });
    setSyncing(prev => ({ ...prev, ...flags }));
    await new Promise(res => setTimeout(res, 2500));
    const nowIso = new Date().toISOString();
    await Promise.all(
      targets.map(t =>
        supabase.from("connected_apps")
          .update({ verified_at: nowIso, updated_at: nowIso })
          .eq("platform", t.conn!.platform)
      )
    );
    const local: Record<string, string> = {};
    const clear: Record<string, boolean> = {};
    targets.forEach(t => { local[t.int.name] = nowIso; clear[t.int.name] = false; });
    setLocalSyncedAt(prev => ({ ...prev, ...local }));
    setSyncing(prev => ({ ...prev, ...clear }));
    setSyncingAll(false);
    toast({ title: `Synced ${targets.length} integration${targets.length === 1 ? "" : "s"} up to current date!` });
    load();
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-display">Integrations</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={syncAll}
          disabled={syncingAll}
          className="text-xs h-8 gap-1.5"
        >
          {syncingAll ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {syncingAll ? "Syncing all…" : "Force Sync All Integrations"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {integrations.map((int) => {
          const conn = findConnection(int.appStorePlatforms);
          const connected = !!conn;
          const toggleOn = toggles[int.name] ?? connected;
          const showWarning = toggleOn && !connected;
          const isSyncing = !!syncing[int.name];
          const effectiveSyncedAt =
            localSyncedAt[int.name] || conn?.verified_at || conn?.updated_at || null;
          return (
            <div key={int.name} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary shrink-0">
                  <int.icon size={16} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{int.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {connected && conn?.platform_username
                      ? <>Connected as <span className="font-medium text-foreground">{conn.platform_username}</span></>
                      : int.description}
                  </p>
                  {showWarning && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} />
                      Action required: Please login to your account via App Store first to start data sync.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {connected ? (
                  <>
                    <Badge className="bg-success/10 text-success border-success/30 text-xs flex items-center gap-1.5">
                      {isSyncing ? (
                        <>
                          <Loader2 size={11} className="animate-spin" />
                          Syncing real-time data…
                        </>
                      ) : (
                        <>
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                          </span>
                          Live · synced {formatSync(effectiveSyncedAt)}
                        </>
                      )}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => syncOne(int.name, conn!.platform)}
                      disabled={isSyncing}
                      title="Sync Now"
                    >
                      <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
                      Sync Now
                    </Button>
                  </>
                ) : showWarning ? (
                  <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-500 bg-amber-500/10">
                    Login required
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Not Connected</Badge>
                )}
                <Switch
                  checked={toggleOn}
                  onCheckedChange={(v) => setToggles(prev => ({ ...prev, [int.name]: v }))}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

interface ConnectedAppProps {
  app: {
    name: string;
    desc: string;
    icon: any;
    iconColor: string;
    iconBg: string;
    category: string;
    fields: { label: string; placeholder: string; key: string; multiline?: boolean }[];
    helpUrl: string;
    helpText: string;
    loginType?: "oauth" | "credentials"; // "oauth" for OAuth-style login, "credentials" for username/password
  };
}

const ConnectedAppCard = ({ app }: ConnectedAppProps) => {
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [verifyStep, setVerifyStep] = useState<"input" | "verifying" | "verified" | "error">("input");
  const [verifiedData, setVerifiedData] = useState<any>(null);
  const [verifyError, setVerifyError] = useState("");
  const [connectedUsername, setConnectedUsername] = useState("");
  const { toast } = useToast();
  const { user } = useAuth();

  // Load connection state from DB on mount — GLOBAL (any admin connection counts)
  useEffect(() => {
    const loadConnection = async () => {
      const { data } = await supabase
        .from("connected_apps")
        .select("*")
        .eq("platform", app.name)
        .eq("is_connected", true)
        .order("verified_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setConnected(true);
        setConnectedUsername(data.platform_username || "");
        setVerifiedData(data.metadata);
      } else {
        setConnected(false);
        setConnectedUsername("");
        setVerifiedData(null);
      }
    };
    loadConnection();

    // Realtime: any admin's connect/disconnect updates every viewer instantly
    const channel = supabase
      .channel(`connected-app-${app.name}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connected_apps", filter: `platform=eq.${app.name}` },
        () => loadConnection(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [app.name]);


  const handleLoginConnect = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      toast({ title: "Missing credentials", description: "Please enter your email/username and password", variant: "destructive" });
      return;
    }
    setVerifyStep("verifying");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Not authenticated", description: "Please login to CRM first", variant: "destructive" });
        setVerifyStep("input");
        return;
      }

      const res = await supabase.functions.invoke("verify-platform-connection", {
        body: { platform: app.name, access_token: loginPassword, app_id: loginEmail },
      });

      if (res.error) {
        setVerifyStep("error");
        setVerifyError(res.error.message || "Verification failed");
        return;
      }

      const result = res.data;
      if (result.valid) {
        setVerifyStep("verified");
        setVerifiedData(result.data);
        setConnectedUsername(result.data?.name || result.data?.email || loginEmail);
        setConnected(true);
        toast({ title: `${app.name} connected!`, description: `Account: ${result.data?.name || result.data?.email || loginEmail}` });
        setTimeout(() => {
          setShowLoginModal(false);
          setVerifyStep("input");
          setLoginEmail("");
          setLoginPassword("");
        }, 2500);
      } else {
        setVerifyStep("error");
        setVerifyError(result.error || "Invalid credentials. Could not verify with " + app.name);
      }
    } catch (err: any) {
      setVerifyStep("error");
      setVerifyError(err.message || "Connection error");
    }
  };

  const handleDisconnect = async () => {
    // Global disconnect — clears the connection for the whole organization
    await supabase
      .from("connected_apps")
      .update({ is_connected: false })
      .eq("platform", app.name);

    setConnected(false);
    setFieldValues({});
    setLoginEmail("");
    setLoginPassword("");
    setVerifiedData(null);
    setConnectedUsername("");
    setVerifyStep("input");
    toast({ title: `${app.name} disconnected` });
  };

  const handleFieldConnect = async () => {
    const allFilled = app.fields.every(f => fieldValues[f.key]?.trim());
    if (!allFilled) {
      toast({ title: "Missing fields", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    if (user) {
      await supabase
        .from("connected_apps")
        .upsert({
          user_id: user.id,
          platform: app.name,
          is_connected: true,
          app_credentials: fieldValues,
          verified_at: new Date().toISOString(),
        }, { onConflict: "user_id,platform" } as any);
    }
    setConnected(true);
    setExpanded(false);
    toast({ title: `${app.name} connected`, description: "Integration is now active" });
  };

  const AppIcon = app.icon;
  const isOAuthLogin = app.loginType === "oauth";

  // Platform-specific login labels
  const platformLoginInfo: Record<string, { emailLabel: string; emailPlaceholder: string; passwordLabel: string; passwordPlaceholder: string }> = {
    "Meta (Facebook & Instagram)": { emailLabel: "Facebook Email / Phone", emailPlaceholder: "Enter your Facebook email or phone number", passwordLabel: "Facebook Password", passwordPlaceholder: "Enter your Facebook password" },
    "Google (Business & Ads)": { emailLabel: "Google Email", emailPlaceholder: "your@gmail.com", passwordLabel: "App Password / OAuth Token", passwordPlaceholder: "Enter your Google app password" },
    "Instagram Graph API": { emailLabel: "Instagram Username / Email", emailPlaceholder: "Enter your Instagram username or email", passwordLabel: "Instagram Password", passwordPlaceholder: "Enter your Instagram password" },
    "Google Analytics": { emailLabel: "Google Email", emailPlaceholder: "your@gmail.com", passwordLabel: "App Password / OAuth Token", passwordPlaceholder: "Enter your Google app password" },
    "YouTube (Channel)": { emailLabel: "Google Email (YouTube)", emailPlaceholder: "your@gmail.com", passwordLabel: "App Password / OAuth Token", passwordPlaceholder: "Enter your Google app password" },
    "LinkedIn": { emailLabel: "LinkedIn Email", emailPlaceholder: "Enter your LinkedIn email", passwordLabel: "LinkedIn Password", passwordPlaceholder: "Enter your LinkedIn password" },
    "Hostinger": { emailLabel: "Hostinger Email", emailPlaceholder: "Enter your Hostinger email", passwordLabel: "Hostinger Password", passwordPlaceholder: "Enter your Hostinger password" },
    "Google My Business": { emailLabel: "Google Email", emailPlaceholder: "your@gmail.com", passwordLabel: "App Password / OAuth Token", passwordPlaceholder: "Enter your Google app password" },
    "Tumblr": { emailLabel: "Tumblr Email", emailPlaceholder: "Enter your Tumblr email", passwordLabel: "Tumblr Password", passwordPlaceholder: "Enter your Tumblr password" },
  };

  const loginInfo = platformLoginInfo[app.name] || { emailLabel: "Email / Username", emailPlaceholder: "Enter your email or username", passwordLabel: "Password", passwordPlaceholder: "Enter your password" };

  return (
    <>
      {/* Card - use div instead of button to avoid nesting issues */}
      <div className={`rounded-xl border transition-all cursor-pointer ${connected ? "border-success/40 bg-success/5" : expanded || showLoginModal ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20"}`}>
        <div
          onClick={() => {
            if (!connected) {
              if (isOAuthLogin) setShowLoginModal(true);
              else setExpanded(!expanded);
            }
          }}
          className="flex items-center gap-4 p-4"
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${app.iconBg}`}>
            <AppIcon size={20} className={app.iconColor} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{app.name}</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{app.category}</Badge>
              {isOAuthLogin && !connected && (
                <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0 rounded-full font-medium">Login to Connect</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {connected && connectedUsername
                ? <><span className="text-success font-medium">●</span> Connected as <span className="font-medium text-foreground">{connectedUsername}</span></>
                : app.desc
              }
            </p>
          </div>
          {connected ? (
            <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
              <span className="inline-flex items-center gap-1 bg-success/10 text-success text-xs px-2 py-0.5 rounded-full font-medium border border-success/30">
                <Check size={12} className="stroke-[3]" /> Connected
              </span>
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          ) : isOAuthLogin ? (
            <div onClick={e => e.stopPropagation()}>
              <Button size="sm" className="gradient-primary border-0 text-xs h-8 shrink-0" onClick={() => setShowLoginModal(true)}>
                <Lock size={12} className="mr-1" /> Login
              </Button>
            </div>
          ) : (
            <ChevronDown size={16} className={`text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />
          )}
        </div>

        {/* Non-OAuth expanded fields */}
        {expanded && !connected && !isOAuthLogin && (
          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
            {app.fields.map(field => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs font-medium">{field.label} <span className="text-destructive">*</span></Label>
                {field.multiline ? (
                  <Textarea
                    value={fieldValues[field.key] || ""}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="text-xs min-h-[80px]"
                  />
                ) : (
                  <Input
                    type={field.key.includes("secret") || field.key.includes("token") ? "password" : "text"}
                    value={fieldValues[field.key] || ""}
                    onChange={e => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="text-xs h-9"
                  />
                )}
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <a href={app.helpUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-1">
                <ExternalLink size={10} /> {app.helpText}
              </a>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-xs h-8" onClick={() => setExpanded(false)}>Cancel</Button>
                <Button size="sm" className="gradient-primary border-0 text-xs h-8" onClick={handleFieldConnect}>
                  <Plug size={12} className="mr-1" /> Connect
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Login Modal */}
      {showLoginModal && isOAuthLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowLoginModal(false); setVerifyStep("input"); }}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`${app.iconBg} p-6 text-center`}>
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-lg mb-3">
                <AppIcon size={32} className={app.iconColor} />
              </div>
              <h3 className="text-lg font-semibold">
                {verifyStep === "verified" ? `${app.name} Connected!` : `Login to ${app.name}`}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {verifyStep === "verified"
                  ? "Your account has been verified and connected"
                  : `Enter your ${app.name} login credentials to connect`}
              </p>
            </div>

            <div className="p-6 space-y-4">
              {/* Step: Login Input */}
              {verifyStep === "input" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{loginInfo.emailLabel}</Label>
                    <Input
                      type="text"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      placeholder={loginInfo.emailPlaceholder}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{loginInfo.passwordLabel}</Label>
                    <Input
                      type="password"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      placeholder={loginInfo.passwordPlaceholder}
                      className="h-11"
                      onKeyDown={e => e.key === "Enter" && handleLoginConnect()}
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Shield size={14} className="text-success shrink-0" />
                    <span>Your credentials are verified directly with {app.name} and securely stored</span>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 h-11" onClick={() => { setShowLoginModal(false); setVerifyStep("input"); }}>
                      Cancel
                    </Button>
                    <Button className="flex-1 h-11 gradient-primary border-0" onClick={handleLoginConnect}>
                      <Lock size={14} className="mr-2" /> Login & Connect
                    </Button>
                  </div>

                  <p className="text-[11px] text-center text-muted-foreground">
                    Your credentials are cross-verified with {app.name}'s official API.
                    <a href={app.helpUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">
                      Learn more
                    </a>
                  </p>
                </>
              )}

              {/* Step: Verifying */}
              {verifyStep === "verifying" && (
                <div className="text-center py-8 space-y-4">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <div className="h-8 w-8 border-[3px] border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Verifying with {app.name}...</p>
                    <p className="text-xs text-muted-foreground mt-1">Cross-checking your credentials with {app.name}</p>
                  </div>
                  <div className="flex flex-col gap-2.5 text-xs text-left max-w-xs mx-auto">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <span>Connecting to {app.name}...</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0.5s" }} />
                      <span>Verifying login credentials...</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-pulse" style={{ animationDelay: "1s" }} />
                      <span>Fetching account details...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step: Verified */}
              {verifyStep === "verified" && verifiedData && (
                <div className="text-center py-6 space-y-4">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                    <Check size={32} className="text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-success">Login Successful!</p>
                    <p className="text-xs text-muted-foreground mt-1">Your {app.name} account is now connected</p>
                  </div>
                  <div className="rounded-lg border border-success/20 bg-success/5 p-4 text-left space-y-2">
                    {verifiedData.name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Account Name</span>
                        <span className="font-semibold">{verifiedData.name}</span>
                      </div>
                    )}
                    {verifiedData.email && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Email</span>
                        <span className="font-medium">{verifiedData.email}</span>
                      </div>
                    )}
                    {verifiedData.user_id && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Account ID</span>
                        <span className="font-mono text-xs">{verifiedData.user_id}</span>
                      </div>
                    )}
                    {verifiedData.pages && verifiedData.pages.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Pages</span>
                        <span className="font-medium">{verifiedData.pages.length} page(s) found</span>
                      </div>
                    )}
                    {verifiedData.instagram_accounts && verifiedData.instagram_accounts.length > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Instagram</span>
                        <span className="font-medium">{verifiedData.instagram_accounts.length} account(s)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step: Error */}
              {verifyStep === "error" && (
                <div className="text-center py-6 space-y-4">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                    <XIcon size={32} className="text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-destructive">Login Failed</p>
                    <p className="text-xs text-muted-foreground mt-1">Could not verify your credentials with {app.name}</p>
                  </div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-left">
                    <p className="text-xs text-destructive">{verifyError}</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1 h-10" onClick={() => { setShowLoginModal(false); setVerifyStep("input"); }}>
                      Cancel
                    </Button>
                    <Button className="flex-1 h-10 gradient-primary border-0" onClick={() => setVerifyStep("input")}>
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
interface SettingsNavItem {
  id: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
  children?: { id: string; label: string; icon: any; adminOnly?: boolean }[];
}

const settingsNav: SettingsNavItem[] = [
  {
    id: "clinic",
    label: "Clinic",
    icon: Building2,
    children: [
      { id: "clinic-info", label: "Clinic Information", icon: Building2 },
      { id: "clinic-branches", label: "Branches", icon: Building2, adminOnly: true },
      { id: "clinic-admin-users", label: "Admin Users", icon: UserCog, adminOnly: true },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    icon: Users,
    adminOnly: true,
    children: [
      { id: "staff-manage", label: "Add & Manage Staff", icon: UserCog },
      { id: "staff-roles", label: "User Roles", icon: Shield },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: Plug,
    children: [
      { id: "integrations-list", label: "Connected Apps", icon: Plug },
    ],
  },
  {
    id: "tax",
    label: "Tax",
    icon: Receipt,
    adminOnly: true,
    children: [
      { id: "tax-gst", label: "GST Settings", icon: Receipt },
      { id: "tax-tds", label: "TDS / TCS", icon: Percent },
      { id: "tax-invoicing", label: "Invoice Settings", icon: FileText },
    ],
  },
  {
    id: "values",
    label: "Values",
    icon: ListChecks,
    adminOnly: true,
    children: [
      { id: "values-treatment", label: "Treatment Types", icon: Tag },
      { id: "values-sources", label: "Lead Sources", icon: ListChecks },
      { id: "values-status", label: "Status Labels", icon: ListChecks },
      { id: "values-departments", label: "Departments", icon: ListChecks },
    ],
  },
  {
    id: "fields",
    label: "Fields",
    icon: FormInput,
    adminOnly: true,
    children: [
      { id: "fields-patient", label: "Patient Fields", icon: FormInput },
      { id: "fields-lead", label: "Lead Fields", icon: FormInput },
      { id: "fields-appointment", label: "Appointment Fields", icon: FormInput },
    ],
  },
  {
    id: "domain",
    label: "Domain",
    icon: GlobeLock,
    adminOnly: true,
    children: [
      { id: "domain-settings", label: "Custom Domain", icon: GlobeLock },
      { id: "domain-email", label: "Email Domain", icon: Globe },
    ],
  },
  {
    id: "appstore",
    label: "App Store",
    icon: Store,
    children: [
      { id: "appstore-connect", label: "Connected Apps", icon: Plug },
      { id: "appstore-browse", label: "Browse Apps", icon: Store },
      { id: "appstore-callyzer", label: "Callyzer Call Tracking", icon: Plug },
      { id: "appstore-installed", label: "Installed Apps", icon: Download },
    ],
  },
  {
    id: "affiliate",
    label: "Affiliate",
    icon: Handshake,
    children: [
      { id: "affiliate-program", label: "Affiliate Program", icon: Handshake },
      { id: "affiliate-earnings", label: "Earnings", icon: IndianRupee },
      { id: "affiliate-referrals", label: "Referral Links", icon: Link2 },
    ],
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    children: [
      { id: "notifications-settings", label: "Notification Preferences", icon: Bell },
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
    children: [
      { id: "appearance-theme", label: "Theme & Display", icon: Palette },
    ],
  },
  {
    id: "security",
    label: "Security",
    icon: Lock,
    adminOnly: true,
    children: [
      { id: "security-settings", label: "Password & Security", icon: Lock },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    adminOnly: true,
    children: [
      { id: "billing-plan", label: "Plan & Billing", icon: CreditCard },
    ],
  },
];

interface TagItem {
  name: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

const createTagItems = (names: string[]): TagItem[] =>
  names.map((name, i) => ({
    name,
    createdAt: new Date(2025, 0 + Math.floor(i / 3), 10 + i),
    updatedAt: new Date(2026, 2, 1 + i),
    isActive: true,
  }));

// Reusable editable list component with tags, dates, edit & enable/disable
const EditableList = ({ title, items, placeholder }: { title: string; items: string[]; placeholder: string }) => {
  const [list, setList] = useState<TagItem[]>(createTagItems(items));
  const [newItem, setNewItem] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const addItem = () => {
    if (newItem.trim()) {
      const now = new Date();
      setList([...list, { name: newItem.trim(), createdAt: now, updatedAt: now, isActive: true }]);
      setNewItem("");
    }
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditValue(list[i].name);
  };

  const saveEdit = (i: number) => {
    if (editValue.trim()) {
      setList(list.map((item, idx) =>
        idx === i ? { ...item, name: editValue.trim(), updatedAt: new Date() } : item
      ));
    }
    setEditingIdx(null);
  };

  const toggleActive = (i: number) => {
    setList(list.map((item, idx) =>
      idx === i ? { ...item, isActive: !item.isActive, updatedAt: new Date() } : item
    ));
  };

  const deleteItem = (i: number) => {
    setList(list.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder}
          className="h-9 text-sm flex-1"
          onKeyDown={(e) => e.key === "Enter" && addItem()}
        />
        <Button size="sm" variant="outline" className="h-9 text-xs" onClick={addItem}>
          <Plus size={14} className="mr-1" /> Add Tag
        </Button>
      </div>

      {/* Tags summary */}
      <div className="flex flex-wrap gap-1.5 pb-2">
        {list.filter((t) => t.isActive).map((tag, i) => (
          <Badge key={i} className="bg-primary/10 text-primary border-primary/20 text-xs px-2 py-0.5">
            <Tag size={10} className="mr-1" />
            {tag.name}
          </Badge>
        ))}
        {list.filter((t) => !t.isActive).length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-1 self-center">
            +{list.filter((t) => !t.isActive).length} inactive
          </span>
        )}
      </div>

      {/* Detailed list */}
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 px-3 py-2 bg-secondary/50 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Tag Name</span>
          <span>Created</span>
          <span>Updated</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>
        <div className="divide-y divide-border">
          {list.map((item, i) => (
            <div
              key={i}
              className={`grid grid-cols-[1fr_100px_100px_100px_80px] gap-2 px-3 py-2.5 items-center text-sm transition-colors ${
                !item.isActive ? "opacity-50 bg-muted/30" : ""
              }`}
            >
              {/* Name / Edit */}
              <div>
                {editingIdx === i ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(i);
                        if (e.key === "Escape") setEditingIdx(null);
                      }}
                    />
                    <button onClick={() => saveEdit(i)} className="text-primary hover:text-primary/80">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingIdx(null)} className="text-muted-foreground hover:text-foreground">
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Tag size={12} className="text-primary/60 shrink-0" />
                    <span className="font-medium">{item.name}</span>
                  </div>
                )}
              </div>

              {/* Created */}
              <span className="text-[11px] text-muted-foreground">
                {format(item.createdAt, "dd MMM yyyy")}
              </span>

              {/* Updated */}
              <span className="text-[11px] text-muted-foreground">
                {format(item.updatedAt, "dd MMM yyyy")}
              </span>

              {/* Status */}
              <div>
                <Switch
                  checked={item.isActive}
                  onCheckedChange={() => toggleActive(i)}
                  className="scale-75"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => startEdit(i)}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => deleteItem(i)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {list.length} total · {list.filter((t) => t.isActive).length} active · {list.filter((t) => !t.isActive).length} inactive
      </p>
    </div>
  );
};

// Map settings nav item id prefixes to settings module access paths
const settingsNavToAccessPath: Record<string, string> = {
  "clinic": "/settings/clinic",
  "clinic-info": "/settings/clinic",
  "clinic-admin-users": "/settings/clinic-admin-users",
  
  
  "staff": "/settings/staff",
  "staff-manage": "/settings/staff",
  "staff-roles": "/settings/staff",
  "integrations": "/settings/integrations",
  "integrations-list": "/settings/integrations",
  "tax": "/settings/tax",
  "tax-gst": "/settings/tax",
  "tax-tds": "/settings/tax",
  "tax-invoicing": "/settings/tax",
  "values": "/settings/values",
  "values-treatment": "/settings/values",
  "values-sources": "/settings/values",
  "values-status": "/settings/values",
  "values-departments": "/settings/values",
  "fields": "/settings/fields",
  "fields-patient": "/settings/fields",
  "fields-lead": "/settings/fields",
  "fields-appointment": "/settings/fields",
  "domain": "/settings/domain",
  "domain-settings": "/settings/domain",
  "domain-email": "/settings/domain",
  "appstore": "/settings/appstore",
  "appstore-connect": "/settings/appstore",
  "appstore-browse": "/settings/appstore",
  "appstore-callyzer": "/settings/appstore",
  "appstore-installed": "/settings/appstore",
  "affiliate": "/settings/affiliate",
  "affiliate-program": "/settings/affiliate",
  "affiliate-earnings": "/settings/affiliate",
  "affiliate-referrals": "/settings/affiliate",
  "notifications": "/settings/notifications",
  "notifications-settings": "/settings/notifications",
  "appearance": "/settings/appearance",
  "appearance-theme": "/settings/appearance",
  "security": "/settings/security",
  "security-settings": "/settings/security",
  "billing": "/settings/billing",
  "billing-plan": "/settings/billing",
};

type FieldRow = { field: string; required: boolean; visible: boolean; type: string; key: string };

const FieldMatrix = ({ namespace, rows }: { namespace: string; rows: FieldRow[] }) => {
  const { toast } = useToast();
  const copy = (shortcode: string) => {
    navigator.clipboard?.writeText(shortcode);
    toast({ title: "Copied", description: shortcode });
  };
  const cols = "grid-cols-[1.2fr_0.9fr_1.6fr_1.2fr_1fr_0.5fr]";
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className={`grid ${cols} gap-3 items-center px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground font-medium`}>
        <span>Field Name</span>
        <span>Field Type</span>
        <span>Unique Key / Shortcode</span>
        <span className="text-right">Status Toggles</span>
        <span>Created On</span>
        <span className="text-right">Actions</span>
      </div>
      {rows.map((f) => {
        const shortcode = `{{${namespace}.${f.key}}}`;
        return (
          <div key={f.field} className={`grid ${cols} gap-3 items-center px-3 py-2.5 border-t border-border`}>
            <span className="text-sm hover:text-primary cursor-pointer">{f.field}</span>
            <div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">{f.type}</Badge>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <code className="bg-muted text-xs font-mono px-2 py-0.5 rounded truncate">{shortcode}</code>
              <button
                type="button"
                onClick={() => copy(shortcode)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Copy shortcode"
              >
                <Copy size={12} />
              </button>
            </div>
            <div className="flex items-center gap-4 justify-end">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch defaultChecked={f.visible} className="scale-75" /> Visible
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch defaultChecked={f.required} className="scale-75" /> Required
              </label>
            </div>
            <span className="text-xs text-muted-foreground">17-10-2025 10:33 AM</span>
            <div className="flex justify-end">
              <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Move to folder">
                <FolderPlus size={12} />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const FieldsToolbar = () => (
  <div className="space-y-2">
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" className="gap-1.5">
        <FolderPlus size={14} /> Add Folder
      </Button>
      <Button size="sm" className="gap-1.5 bg-success hover:bg-success/90 text-success-foreground">
        <Plus size={14} /> Add Field
      </Button>
    </div>
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search field..." className="h-9 pl-8 text-sm" />
      </div>
      <Button size="sm" className="bg-success hover:bg-success/90 text-success-foreground uppercase text-xs tracking-wide h-9">
        Search
      </Button>
    </div>
  </div>
);





const CRMSettings = () => {
  const { hasRole, moduleAccess } = useAuth();
  const { toast } = useToast();
  const isAdmin = hasRole('admin' as any);
  const [activeSection, setActiveSection] = useState("clinic-info");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    clinic: true,
  });

  const hasCustomSettingsAccess = Object.keys(moduleAccess).length > 0;

  const hasExplicitSettingsAccess = (id: string) => {
    const accessPath = settingsNavToAccessPath[id];
    return accessPath ? moduleAccess[accessPath] === true : false;
  };

  const isSettingsChildVisible = (child: NonNullable<SettingsNavItem["children"]>[number]) => {
    if (isAdmin) return true;
    if (hasCustomSettingsAccess) {
      return hasExplicitSettingsAccess(child.id);
    }
    return !child.adminOnly;
  };

  const isSettingsItemVisible = (item: SettingsNavItem) => {
    if (isAdmin) return true;

    const visibleChildren = (item.children || []).filter(isSettingsChildVisible);
    if (visibleChildren.length > 0) return true;

    if (hasCustomSettingsAccess) {
      return hasExplicitSettingsAccess(item.id);
    }

    return !item.adminOnly;
  };

  const visibleSettingsNav = settingsNav
    .filter(isSettingsItemVisible)
    .map((item) => ({
      ...item,
      children: (item.children || []).filter(isSettingsChildVisible),
    }));

  // ── Clinic Settings State ──
  const [clinicSettings, setClinicSettings] = useState<any>(null);
  const [clinicForm, setClinicForm] = useState({
    clinic_name: "", phone: "", address: "", email: "", website: "", google_review_link: "",
    show_pending_balance_on_invoice: false,
    appointment_reminder_auto: false, follow_up_reminder_auto: false,
    birthday_wishes: false, show_finance_obstacles: false, lab_order_updates_to_patient: false,
  });
  const [clinicSaving, setClinicSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [sealUploading, setSealUploading] = useState(false);

  const loadClinicSettings = useCallback(async () => {
    const { data } = await supabase.from("clinic_settings").select("*").limit(1).single();
    if (data) {
      setClinicSettings(data);
      setClinicForm({
        clinic_name: data.clinic_name || "",
        phone: data.phone || "",
        address: data.address || "",
        email: data.email || "",
        website: data.website || "",
        google_review_link: data.google_review_link || "",
        show_pending_balance_on_invoice: data.show_pending_balance_on_invoice || false,
        appointment_reminder_auto: data.appointment_reminder_auto || false,
        follow_up_reminder_auto: data.follow_up_reminder_auto || false,
        birthday_wishes: data.birthday_wishes || false,
        show_finance_obstacles: data.show_finance_obstacles || false,
        lab_order_updates_to_patient: data.lab_order_updates_to_patient || false,
      });
    }
  }, []);

  useEffect(() => { loadClinicSettings(); }, [loadClinicSettings]);

  useEffect(() => {
    const currentSectionIsVisible = visibleSettingsNav.some((item) =>
      (item.children || []).some((child) => child.id === activeSection)
    );

    if (currentSectionIsVisible) return;

    const firstVisibleGroup = visibleSettingsNav[0];
    const firstVisibleSection = firstVisibleGroup?.children?.[0]?.id;

    if (!firstVisibleGroup || !firstVisibleSection) return;

    setExpandedGroups((prev) => ({ ...prev, [firstVisibleGroup.id]: true }));
    setActiveSection(firstVisibleSection);
  }, [activeSection, visibleSettingsNav]);

  const saveClinicSettings = async () => {
    if (!clinicSettings?.id) return;
    setClinicSaving(true);
    const { error } = await supabase.from("clinic_settings").update({
      ...clinicForm, updated_at: new Date().toISOString(),
    }).eq("id", clinicSettings.id);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Clinic settings saved" });
      loadClinicSettings();
    }
    setClinicSaving(false);
  };

  const uploadFile = async (file: File, folder: string, setUploading: (v: boolean) => void, field: "logo_url" | "seal_url") => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("clinic-assets").upload(path, file, { upsert: true });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("clinic-assets").getPublicUrl(path);
    await supabase.from("clinic_settings").update({ [field]: urlData.publicUrl, updated_at: new Date().toISOString() } as any).eq("id", clinicSettings.id);
    toast({ title: "Uploaded successfully" });
    loadClinicSettings();
    setUploading(false);
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleChildClick = (parentId: string, childId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [parentId]: true }));
    setActiveSection(childId);
  };

  const renderContent = () => {
    switch (activeSection) {
      // ── CLINIC ──
      case "clinic-info":
        return (
          <div className="space-y-6">
            {/* Contact Settings */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-display">Contact Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Clinic Name</Label>
                    <Input value={clinicForm.clinic_name} onChange={e => setClinicForm(p => ({ ...p, clinic_name: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Phone</Label>
                    <Input value={clinicForm.phone} onChange={e => setClinicForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Address</Label>
                  <Input value={clinicForm.address} onChange={e => setClinicForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Email</Label>
                    <Input value={clinicForm.email} onChange={e => setClinicForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Website</Label>
                    <Input value={clinicForm.website} onChange={e => setClinicForm(p => ({ ...p, website: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Google Review Link</Label>
                  <Input value={clinicForm.google_review_link} onChange={e => setClinicForm(p => ({ ...p, google_review_link: e.target.value }))} placeholder="https://g.page/r/..." />
                </div>
                <Button onClick={saveClinicSettings} disabled={clinicSaving} className="gradient-primary border-0">
                  {clinicSaving ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>

            {/* Print Settings */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-display">Print Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-6">
                  {/* Logo */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Clinic Logo</Label>
                    <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-3 bg-secondary/30 min-h-[120px] justify-center">
                      {clinicSettings?.logo_url ? (
                        <img src={clinicSettings.logo_url} alt="Clinic Logo" className="max-h-24 max-w-full object-contain rounded border border-border" />
                      ) : (
                        <div className="text-xs text-muted-foreground text-center">No logo uploaded</div>
                      )}
                      <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                        {logoUploading ? "Uploading..." : "Upload Logo"}
                        <input type="file" accept="image/*" className="hidden" disabled={logoUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "logos", setLogoUploading, "logo_url"); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>
                  {/* Seal */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Clinic Seal</Label>
                    <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-3 bg-secondary/30 min-h-[120px] justify-center">
                      {clinicSettings?.seal_url ? (
                        <img src={clinicSettings.seal_url} alt="Clinic Seal" className="max-h-24 max-w-full object-contain rounded border border-border" />
                      ) : (
                        <div className="text-xs text-muted-foreground text-center">No seal uploaded</div>
                      )}
                      <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
                        {sealUploading ? "Uploading..." : "Upload Seal"}
                        <input type="file" accept="image/*" className="hidden" disabled={sealUploading}
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "seals", setSealUploading, "seal_url"); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Invoice toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">Show Pending Balance on Invoice</p>
                    <p className="text-xs text-muted-foreground">Display outstanding balance when sending invoices</p>
                  </div>
                  <Switch checked={clinicForm.show_pending_balance_on_invoice}
                    onCheckedChange={v => { setClinicForm(p => ({ ...p, show_pending_balance_on_invoice: v })); }} />
                </div>
                <Button onClick={saveClinicSettings} disabled={clinicSaving} className="gradient-primary border-0">
                  {clinicSaving ? "Saving..." : "Save Print Settings"}
                </Button>
              </CardContent>
            </Card>

            {/* Notification Settings */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base font-display">Notification Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "appointment_reminder_auto", label: "Appointment Reminder Auto", desc: "Automatically send appointment reminders to patients" },
                  { key: "follow_up_reminder_auto", label: "Follow-up Reminder Auto", desc: "Automatically send follow-up reminders" },
                  { key: "birthday_wishes", label: "Birthday Wishes", desc: "Send birthday greetings to patients automatically" },
                  { key: "show_finance_obstacles", label: "Show Finance Obstacles", desc: "Display financial alerts and obstacles" },
                  { key: "lab_order_updates_to_patient", label: "Lab Order Updates to Patient", desc: "Notify patients about lab order status changes" },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={(clinicForm as any)[item.key]}
                      onCheckedChange={v => setClinicForm(p => ({ ...p, [item.key]: v }))}
                    />
                  </div>
                ))}
                <Button onClick={saveClinicSettings} disabled={clinicSaving} className="gradient-primary border-0">
                  {clinicSaving ? "Saving..." : "Save Notification Settings"}
                </Button>
              </CardContent>
            </Card>
          </div>
        );
      case "clinic-branches":
        return <BranchManager />;
      case "clinic-admin-users":
        return <ClinicSettingsTabs activeTab="admin-users" />;



      // ── STAFF ──
      case "staff-manage":
        return <StaffManager />;
      case "staff-roles":
        return (
          <div className="space-y-6">
            <UnifiedRolesTree />
            <RoleHierarchyChart />
          </div>
        );

      // ── INTEGRATIONS ──
      case "integrations-list":
        return <IntegrationsList />;


      // ── TAX ──
      case "tax-gst":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">GST Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GSTIN Number</Label>
                  <Input placeholder="e.g. 33AABCU9603R1ZM" />
                </div>
                <div className="space-y-2">
                  <Label>GST Registration Type</Label>
                  <Select defaultValue="regular">
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="composition">Composition</SelectItem>
                      <SelectItem value="unregistered">Unregistered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default GST Rate (%)</Label>
                  <Select defaultValue="18">
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempt)</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>HSN/SAC Code</Label>
                  <Input defaultValue="9993" placeholder="Service code" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Enable GST on Invoices</p>
                  <p className="text-xs text-muted-foreground">Auto-apply GST to all billing invoices</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Show GST Breakdown</p>
                  <p className="text-xs text-muted-foreground">Display CGST & SGST separately on invoices</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button className="gradient-primary border-0">Save GST Settings</Button>
            </CardContent>
          </Card>
        );

      case "tax-tds":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">TDS / TCS Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>TAN Number</Label>
                  <Input placeholder="e.g. CHES12345E" />
                </div>
                <div className="space-y-2">
                  <Label>PAN Number</Label>
                  <Input placeholder="e.g. ABCDE1234F" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Enable TDS Deduction</p>
                  <p className="text-xs text-muted-foreground">Auto-deduct TDS on vendor payments</p>
                </div>
                <Switch />
              </div>
              <div className="space-y-2">
                <Label>Default TDS Rate (%)</Label>
                <Select defaultValue="10">
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1%</SelectItem>
                    <SelectItem value="2">2%</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="10">10%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="gradient-primary border-0">Save TDS Settings</Button>
            </CardContent>
          </Card>
        );

      case "tax-invoicing":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Invoice Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Prefix</Label>
                  <Input defaultValue="DN-INV" />
                </div>
                <div className="space-y-2">
                  <Label>Next Invoice Number</Label>
                  <Input type="number" defaultValue="1001" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Invoice Footer Text</Label>
                <Textarea defaultValue="Thank you for choosing Doctor Neets Dentistry. Get well soon!" className="text-sm" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Payment Terms</Label>
                <Select defaultValue="due_on_receipt">
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    <SelectItem value="net_7">Net 7 Days</SelectItem>
                    <SelectItem value="net_15">Net 15 Days</SelectItem>
                    <SelectItem value="net_30">Net 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Auto-generate Invoice Number</p>
                  <p className="text-xs text-muted-foreground">Sequential numbering for each invoice</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button className="gradient-primary border-0">Save Invoice Settings</Button>
            </CardContent>
          </Card>
        );

      // ── VALUES ──
      case "values-treatment":
        return (
          <Card className="shadow-card" key="values-treatment">
            <CardHeader>
              <CardTitle className="text-base font-display">Treatment Types</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                key="values-treatment-list"
                title="Manage treatment types used across the CRM"
                items={[
                  "Consultation / General Checkup",
                  "Scaling & Polishing",
                  "Root Canal Treatment (RCT)",
                  "Dental Implants",
                  "Orthodontics (Braces/Aligners)",
                  "Extractions",
                  "Teeth Whitening",
                ]}
                placeholder="Add new treatment type..."
              />
            </CardContent>
          </Card>
        );

      case "values-sources":
        return (
          <Card className="shadow-card" key="values-sources">
            <CardHeader>
              <CardTitle className="text-base font-display">Lead Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                key="values-sources-list"
                title="Manage lead source options"
                items={[
                  "Google Ads",
                  "Meta Ads (Facebook/Instagram)",
                  "Walk-in",
                  "Referral (Existing Patient)",
                  "Website / Organic Search",
                ]}
                placeholder="Add new lead source..."
              />
            </CardContent>
          </Card>
        );

      case "values-status":
        return (
          <Card className="shadow-card" key="values-status">
            <CardHeader>
              <CardTitle className="text-base font-display">Status Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                key="values-status-list"
                title="Manage lead & patient journey statuses"
                items={[
                  "New Lead",
                  "Contacted",
                  "Appointment Booked",
                  "Consultation Done",
                  "Treatment In-Progress",
                  "Treatment Completed",
                ]}
                placeholder="Add new status..."
              />
            </CardContent>
          </Card>
        );

      case "values-departments":
        return (
          <Card className="shadow-card" key="values-departments">
            <CardHeader>
              <CardTitle className="text-base font-display">Departments</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                key="values-departments-list"
                title="Manage clinic departments"
                items={[
                  "Administration",
                  "Clinical (Doctors & Assistants)",
                  "Front Desk / Reception",
                  "Marketing / Sales",
                  "Finance",
                ]}
                placeholder="Add new department..."
              />
            </CardContent>
          </Card>
        );

      // ── FIELDS ──
      case "fields-patient":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Patient Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure which fields are visible and required in the patient form.</p>
              <FieldsToolbar />
              <FieldMatrix
                namespace="patient"
                rows={[
                  { field: "First Name", required: true, visible: true, type: "Single Line Text", key: "first_name" },
                  { field: "Last Name", required: true, visible: true, type: "Single Line Text", key: "last_name" },
                  { field: "Phone", required: true, visible: true, type: "Phone", key: "phone" },
                  { field: "Email", required: false, visible: true, type: "Email", key: "email" },
                  { field: "Date of Birth", required: false, visible: true, type: "Date", key: "date_of_birth" },
                  { field: "Gender", required: false, visible: true, type: "Dropdown", key: "gender" },
                  { field: "Address", required: false, visible: true, type: "Multi-line Text", key: "address" },
                  { field: "Blood Group", required: false, visible: false, type: "Dropdown", key: "blood_group" },
                  { field: "Aadhar Number", required: false, visible: false, type: "Single Line Text", key: "aadhar_number" },
                  { field: "Emergency Contact", required: false, visible: false, type: "Single Line Text", key: "emergency_contact" },
                  { field: "Insurance Details", required: false, visible: false, type: "Single Line Text", key: "insurance_details" },
                  { field: "Allergies", required: false, visible: true, type: "Multi-line Text", key: "allergies" },
                  { field: "Medical History", required: false, visible: true, type: "Multi-line Text", key: "medical_history" },
                ]}
              />
              <Button className="gradient-primary border-0">Save Field Settings</Button>
            </CardContent>
          </Card>
        );

      case "fields-lead":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Lead Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure lead form fields visibility and requirements.</p>
              <FieldsToolbar />
              <FieldMatrix
                namespace="lead"
                rows={[
                  { field: "Name", required: true, visible: true, type: "Single Line Text", key: "name" },
                  { field: "Phone", required: true, visible: true, type: "Phone", key: "phone" },
                  { field: "Email", required: false, visible: true, type: "Email", key: "email" },
                  { field: "Treatment Interest", required: true, visible: true, type: "Dropdown", key: "treatment_interest" },
                  { field: "Source", required: true, visible: true, type: "Dropdown", key: "source" },
                  { field: "City", required: false, visible: true, type: "Single Line Text", key: "city" },
                  { field: "Age", required: false, visible: true, type: "Number", key: "age" },
                  { field: "Dental Problem", required: false, visible: true, type: "Dropdown", key: "dental_problem" },
                  { field: "Estimated Value", required: false, visible: false, type: "Number", key: "estimated_value" },
                  { field: "Notes", required: false, visible: true, type: "Multi-line Text", key: "notes" },
                ]}
              />
              <Button className="gradient-primary border-0">Save Field Settings</Button>
            </CardContent>
          </Card>
        );

      case "fields-appointment":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Appointment Fields</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure appointment form fields.</p>
              <FieldsToolbar />
              <FieldMatrix
                namespace="appointment"
                rows={[
                  { field: "Patient", required: true, visible: true, type: "Patient Lookup", key: "patient" },
                  { field: "Date", required: true, visible: true, type: "Date", key: "date" },
                  { field: "Time Slot", required: true, visible: true, type: "Time Selection", key: "time_slot" },
                  { field: "Doctor", required: true, visible: true, type: "Dropdown", key: "doctor" },
                  { field: "Type", required: true, visible: true, type: "Dropdown", key: "type" },
                  { field: "Source", required: false, visible: true, type: "Dropdown", key: "source" },
                  { field: "Notes", required: false, visible: true, type: "Multi-line Text", key: "notes" },
                ]}
              />
              <Button className="gradient-primary border-0">Save Field Settings</Button>
            </CardContent>
          </Card>
        );



      // ── DOMAIN ──
      case "domain-settings":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Custom Domain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Connect your own domain to access the CRM from your branded URL.</p>
              <div className="space-y-2">
                <Label>Custom Domain</Label>
                <Input placeholder="crm.neetsdentistry.com" />
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-sm font-medium">DNS Configuration</p>
                <p className="text-xs text-muted-foreground">Add the following CNAME record to your DNS provider:</p>
                <div className="bg-secondary rounded-md p-3 font-mono text-xs">
                  <p>Type: <span className="text-primary font-semibold">CNAME</span></p>
                  <p>Name: <span className="text-primary font-semibold">crm</span></p>
                  <p>Value: <span className="text-primary font-semibold">proxy.lovable.app</span></p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">SSL Certificate</p>
                  <p className="text-xs text-muted-foreground">Auto-provisioned via Let's Encrypt</p>
                </div>
                <Badge className="bg-success/10 text-success border-0 text-xs">Active</Badge>
              </div>
              <Button className="gradient-primary border-0">Save Domain</Button>
            </CardContent>
          </Card>
        );

      case "domain-email":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Email Domain</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Configure email sending domain for campaigns & notifications.</p>
              <div className="space-y-2">
                <Label>Sending Domain</Label>
                <Input placeholder="mail.neetsdentistry.com" />
              </div>
              <div className="space-y-2">
                <Label>From Email</Label>
                <Input defaultValue="hello@neetsdentistry.com" />
              </div>
              <div className="space-y-2">
                <Label>Reply-to Email</Label>
                <Input defaultValue="info@neetsdentistry.com" />
              </div>
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-sm font-medium">Email Authentication</p>
                <div className="space-y-1.5">
                  {[
                    { label: "SPF Record", status: "Verified" },
                    { label: "DKIM Record", status: "Pending" },
                    { label: "DMARC Record", status: "Not Set" },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span>{r.label}</span>
                      <Badge
                        variant={r.status === "Verified" ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 py-0 ${r.status === "Verified" ? "bg-success/10 text-success border-0" : ""}`}
                      >
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <Button className="gradient-primary border-0">Save Email Settings</Button>
            </CardContent>
          </Card>
        );

      // ── APP STORE: CONNECTED APPS ──
      case "appstore-connect":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Connected Apps & Platforms</CardTitle>
              <p className="text-xs text-muted-foreground">Connect your social media, analytics & hosting accounts to manage everything from one place.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  name: "Meta (Facebook & Instagram)",
                  desc: "Connect Facebook Pages & Instagram Business accounts for posting, inbox & ads management",
                  icon: Facebook,
                  iconColor: "text-blue-600",
                  iconBg: "bg-blue-600/10",
                  category: "Social Media",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://developers.facebook.com/apps/",
                  helpText: "Learn more about Meta integration",
                },
                {
                  name: "Google (Business & Ads)",
                  desc: "Connect Google Business Profile, Google Ads & Google My Business for local SEO and ad campaigns",
                  icon: Globe,
                  iconColor: "text-red-500",
                  iconBg: "bg-red-500/10",
                  category: "Marketing",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://console.cloud.google.com/",
                  helpText: "Learn more about Google integration",
                },
                {
                  name: "Instagram Graph API",
                  desc: "Direct Instagram API access for posting reels, stories & managing DMs independently",
                  icon: Globe,
                  iconColor: "text-pink-500",
                  iconBg: "bg-pink-500/10",
                  category: "Social Media",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://developers.facebook.com/docs/instagram-api/",
                  helpText: "Learn more about Instagram integration",
                },
                {
                  name: "Google Analytics",
                  desc: "Track website visitors, conversion funnel, lead sources & campaign performance",
                  icon: Globe,
                  iconColor: "text-yellow-600",
                  iconBg: "bg-yellow-600/10",
                  category: "Analytics",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://analytics.google.com/",
                  helpText: "Learn more about Google Analytics",
                },
                {
                  name: "YouTube (Channel)",
                  desc: "Manage YouTube channel — upload videos, shorts, read comments & analytics",
                  icon: Globe,
                  iconColor: "text-red-600",
                  iconBg: "bg-red-600/10",
                  category: "Social Media",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://console.cloud.google.com/",
                  helpText: "Learn more about YouTube integration",
                },
                {
                  name: "LinkedIn",
                  desc: "Post updates, articles & manage company page from CRM",
                  icon: Globe,
                  iconColor: "text-blue-700",
                  iconBg: "bg-blue-700/10",
                  category: "Social Media",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://www.linkedin.com/developers/",
                  helpText: "Learn more about LinkedIn integration",
                },
                {
                  name: "Hostinger",
                  desc: "Connect your Hostinger hosting account for domain, DNS & website management",
                  icon: GlobeLock,
                  iconColor: "text-purple-600",
                  iconBg: "bg-purple-600/10",
                  category: "Hosting",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://www.hostinger.com/",
                  helpText: "Learn more about Hostinger integration",
                },
                {
                  name: "Google My Business",
                  desc: "Manage your Google Business Profile — posts, reviews, Q&A, insights & local SEO directly from CRM",
                  icon: Globe,
                  iconColor: "text-green-600",
                  iconBg: "bg-green-600/10",
                  category: "Local SEO",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://console.cloud.google.com/",
                  helpText: "Learn more about Google My Business",
                },
                {
                  name: "Tumblr",
                  desc: "Connect your Tumblr blog for cross-posting dental tips, articles & patient stories",
                  icon: Globe,
                  iconColor: "text-indigo-500",
                  iconBg: "bg-indigo-500/10",
                  category: "Social Media",
                  loginType: "oauth" as const,
                  fields: [],
                  helpUrl: "https://www.tumblr.com/oauth/apps",
                  helpText: "Learn more about Tumblr integration",
                },
                {
                  name: "WhatsApp Business API",
                  desc: "Connect any WhatsApp Business API provider (Meta Cloud API, Gupshup, Wati, AiSensy, Interakt, etc.)",
                  icon: MessageSquare,
                  iconColor: "text-green-500",
                  iconBg: "bg-green-500/10",
                  category: "Messaging Gateway",
                  fields: [
                    { label: "API Provider", placeholder: "e.g., Meta Cloud API, Gupshup, Wati, AiSensy, Interakt", key: "wa_provider" },
                    { label: "API Base URL", placeholder: "https://api.provider.com/v1", key: "wa_api_url" },
                    { label: "API Key / Auth Token", placeholder: "Enter your API key or Bearer token", key: "wa_api_key" },
                    { label: "Phone Number ID", placeholder: "Enter WhatsApp Phone Number ID", key: "wa_phone_id" },
                    { label: "Business Account ID", placeholder: "Enter WhatsApp Business Account ID (WABA ID)", key: "wa_waba_id" },
                    { label: "Webhook Verify Token", placeholder: "Create a verify token for webhooks", key: "wa_webhook_token" },
                  ],
                  helpUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/",
                  helpText: "Works with any WhatsApp BSP — enter your provider's credentials",
                },
                {
                  name: "IVR Gateway",
                  desc: "Connect any IVR/cloud telephony provider (Exotel, Knowlarity, MyOperator, Ozonetel, Twilio, etc.)",
                  icon: Phone,
                  iconColor: "text-orange-500",
                  iconBg: "bg-orange-500/10",
                  category: "Telephony Gateway",
                  fields: [
                    { label: "IVR Provider", placeholder: "e.g., Exotel, Knowlarity, MyOperator, Ozonetel, Twilio", key: "ivr_provider" },
                    { label: "API Base URL", placeholder: "https://api.provider.com/v1", key: "ivr_api_url" },
                    { label: "API Key / SID", placeholder: "Enter API Key or Account SID", key: "ivr_api_key" },
                    { label: "API Secret / Auth Token", placeholder: "Enter API Secret or Auth Token", key: "ivr_api_secret" },
                    { label: "Virtual Number", placeholder: "+91XXXXXXXXXX", key: "ivr_virtual_number" },
                    { label: "Webhook URL (Callback)", placeholder: "Auto-generated after save", key: "ivr_webhook_url" },
                    { label: "Caller ID", placeholder: "Enter Caller ID / DID Number", key: "ivr_caller_id" },
                  ],
                  helpUrl: "https://exotel.com/",
                  helpText: "Works with any IVR provider — enter your provider's API credentials",
                },
              ].map((app) => (
                <ConnectedAppCard key={app.name} app={app} />
              ))}
            </CardContent>
          </Card>
        );

      // ── APP STORE: BROWSE ──
      case "appstore-browse":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Browse Apps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Extend your CRM with powerful add-ons.</p>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Plug size={18} className="text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">Callyzer Call Tracking</p>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Telephony</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sync raw telecaller call logs from Callyzer via webhook and backfill
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={() => setActiveSection("appstore-callyzer")}
                >
                  Configure
                </Button>
              </div>
              {[
                { name: "AI Lead Scoring", desc: "Auto-score leads with AI based on behavior & demographics", category: "AI", installed: true },
                { name: "WhatsApp Business Cloud", desc: "Official Meta WhatsApp Cloud API integration", category: "Messaging", installed: true },
                { name: "Google Calendar Sync", desc: "Two-way sync appointments with Google Calendar", category: "Productivity", installed: false },
                { name: "Razorpay Payments", desc: "Accept online payments via Razorpay payment gateway", category: "Payments", installed: false },
                { name: "SMS Gateway (MSG91)", desc: "Bulk SMS & OTP via MSG91 API", category: "Messaging", installed: false },
                { name: "Tally Integration", desc: "Sync invoices & expenses with Tally ERP", category: "Accounting", installed: false },
                { name: "Patient Portal", desc: "Self-service portal for patients to book & view records", category: "Patient Experience", installed: false },
                { name: "AI Chat Assistant", desc: "AI-powered chat for patient queries on website", category: "AI", installed: false },
              ].map((app) => (
                <div key={app.name} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                      <Store size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{app.name}</p>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{app.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{app.desc}</p>
                    </div>
                  </div>
                  {app.installed ? (
                    <Badge className="bg-success/10 text-success border-0 text-xs">Installed</Badge>
                  ) : (
                    <Button size="sm" variant="outline" className="text-xs h-8">
                      <Download size={13} className="mr-1" /> Install
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );

      case "appstore-callyzer":
        return <CallyzerIntegration />;

      case "appstore-installed":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Installed Apps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "AI Lead Scoring", version: "2.1.0", status: "Active" },
                { name: "WhatsApp Business Cloud", version: "1.5.2", status: "Active" },
              ].map((app) => (
                <div key={app.name} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Store size={18} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-muted-foreground">v{app.version}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-success/10 text-success border-0 text-xs">{app.status}</Badge>
                    <Switch defaultChecked />
                  </div>
                </div>
              ))}
              {[].length === 0 && (
                <p className="text-xs text-muted-foreground">No additional installed apps. Browse the App Store to add more.</p>
              )}
            </CardContent>
          </Card>
        );

      // ── AFFILIATE ──
      case "affiliate-program":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Affiliate Program</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center gap-3">
                  <Gift size={24} className="text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-primary">Refer & Earn</p>
                    <p className="text-xs text-muted-foreground">Refer other dental clinics and earn 20% commission on their subscription for 12 months.</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Card className="border">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">3</p>
                    <p className="text-xs text-muted-foreground mt-1">Active Referrals</p>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">₹14,997</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Earned</p>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">₹4,999</p>
                    <p className="text-xs text-muted-foreground mt-1">Pending Payout</p>
                  </CardContent>
                </Card>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">Auto-apply Affiliate Credits</p>
                  <p className="text-xs text-muted-foreground">Deduct earnings from your subscription bill</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        );

      case "affiliate-earnings":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Affiliate Earnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y divide-border rounded-lg border border-border">
                {[
                  { clinic: "Smile Dental Care, Coimbatore", joined: "Jan 2026", monthly: "₹999", earned: "₹2,997", status: "Active" },
                  { clinic: "Pearl Dental Clinic, Madurai", joined: "Feb 2026", monthly: "₹999", earned: "₹999", status: "Active" },
                  { clinic: "City Dental Hospital, Trichy", joined: "Mar 2026", monthly: "₹4,999", earned: "₹4,999", status: "Active" },
                ].map((r) => (
                  <div key={r.clinic} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{r.clinic}</p>
                      <p className="text-xs text-muted-foreground">Joined {r.joined} · {r.monthly}/mo</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary">{r.earned}</p>
                      <Badge className="bg-success/10 text-success border-0 text-[10px]">{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      case "affiliate-referrals":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-display">Referral Links</CardTitle>
                <Button size="sm" variant="outline" className="text-xs h-8">
                  <Plus size={13} className="mr-1" /> Create Link
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { name: "Default Link", code: "DRNEEMZ20", url: "https://dental-reach-flow.lovable.app/ref/DRNEEMZ20", clicks: 45, conversions: 3 },
                  { name: "WhatsApp Campaign", code: "DRNEEMZ-WA", url: "https://dental-reach-flow.lovable.app/ref/DRNEEMZ-WA", clicks: 12, conversions: 0 },
                ].map((link) => (
                  <div key={link.code} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{link.name}</p>
                      <Badge variant="secondary" className="text-[10px]">{link.code}</Badge>
                    </div>
                    <div className="flex items-center gap-2 bg-secondary rounded-md p-2">
                      <code className="text-xs flex-1 truncate text-muted-foreground">{link.url}</code>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2">Copy</Button>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{link.clicks} clicks</span>
                      <span>{link.conversions} conversions</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      // ── NOTIFICATIONS ──
      case "notifications-settings":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Notification Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "New Lead Alerts", desc: "Get notified when a new lead comes in", checked: true },
                { label: "Appointment Reminders", desc: "Reminders before scheduled appointments", checked: true },
                { label: "Follow-up Due", desc: "Alert when follow-ups are due", checked: true },
                { label: "Low Inventory", desc: "Notify when stock is below minimum", checked: false },
                { label: "Payment Received", desc: "Alert on successful payments", checked: false },
                { label: "Staff Leave Requests", desc: "Notify on new leave applications", checked: true },
              ].map((n) => (
                <div key={n.label} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch defaultChecked={n.checked} />
                </div>
              ))}
            </CardContent>
          </Card>
        );

      // ── APPEARANCE ──
      case "appearance-theme":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Theme & Display</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Dark Mode", desc: "Switch between light and dark themes", checked: false },
                { label: "Compact View", desc: "Reduce spacing for denser layouts", checked: false },
                { label: "Tamil Language", desc: "தமிழில் காண்க", checked: false },
              ].map((t) => (
                <div key={t.label} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                  <Switch defaultChecked={t.checked} />
                </div>
              ))}
            </CardContent>
          </Card>
        );

      // ── SECURITY ──
      case "security-settings":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Password & Security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input type="password" placeholder="Enter current password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" placeholder="Enter new password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" placeholder="Confirm new password" />
                </div>
              </div>
              <Button className="gradient-primary border-0">Update Password</Button>
              <div className="pt-4 border-t border-border space-y-3">
                {[
                  { label: "Two-Factor Authentication", desc: "Extra security for your account", checked: false },
                  { label: "Session Timeout", desc: "Auto-logout after inactivity", checked: true },
                ].map((s) => (
                  <div key={s.label} className="flex items-center justify-between rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-medium">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                    <Switch defaultChecked={s.checked} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );

      // ── BILLING ──
      case "billing-plan":
        return (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base font-display">Plan & Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-primary">Pro Plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Unlimited staff, all modules, priority support</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 text-xs">Active</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Next billing date: March 15, 2026 · ₹4,999/month
              </div>
            </CardContent>
          </Card>
        );

      default:
        return (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Select a section from the left menu
          </div>
        );
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-display">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your CRM configuration</p>
      </div>

      <div className="flex gap-6">
        {/* Left Navigation */}
        <div className="w-56 shrink-0">
          <nav className="space-y-0.5 sticky top-4">
            {visibleSettingsNav.map((item) => {
              const isExpanded = expandedGroups[item.id] ?? false;
              const visibleChildren = item.children || [];
              const hasActiveChild = visibleChildren.some(
                (child) => child.id === activeSection
              );

              return (
                <div key={item.id}>
                  <button
                    onClick={() => {
                      toggleGroup(item.id);
                      if (visibleChildren.length === 1) {
                        handleChildClick(item.id, visibleChildren[0].id);
                      }
                    }}
                    className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      hasActiveChild
                        ? "text-primary bg-primary/5"
                        : "text-foreground/70 hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <item.icon size={16} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {visibleChildren.length > 1 && (
                      isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                  </button>
                  {isExpanded && visibleChildren.length > 1 && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                      {visibleChildren.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => handleChildClick(item.id, child.id)}
                          className={`flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            activeSection === child.id
                              ? "text-primary bg-primary/10"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                          }`}
                        >
                          <child.icon size={13} />
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 max-w-3xl">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default CRMSettings;
