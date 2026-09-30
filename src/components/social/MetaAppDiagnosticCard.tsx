import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldQuestion } from "lucide-react";

type Diagnostic = {
  ok: boolean;
  app?: { id: string | null; name: string | null };
  token?: {
    type: string | null;
    isValid: boolean | null;
    ownerName: string | null;
    ownerId: string | null;
    expiresAt: string | null;
    neverExpires?: boolean;
  };
  permissions?: { checked: boolean; granted: string[]; missing: string[]; required: string[] };
  config?: {
    tokenPresent: boolean;
    tokenFingerprint: string;
    pageId: string | null;
    instagramAccountId: string | null;
    verifyTokenPresent: boolean;
  };
  error?: string | null;
  checkedAt?: string;
};

export function MetaAppDiagnosticCard() {
  const [data, setData] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("meta-app-diagnostic", { body: {} });
      if (fnError) throw fnError;
      setData(res as Diagnostic);
    } catch (e) {
      setError((e as Error).message || "Failed to inspect Meta credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const missing = data?.permissions?.missing ?? [];
  const appName = data?.app?.name;
  const appId = data?.app?.id;

  return (
    <Card className="p-3 mb-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Meta App Diagnostic
          </p>
          {loading && !data ? (
            <p className="text-xs text-muted-foreground mt-1">Inspecting active credentials…</p>
          ) : appId ? (
            <p className="text-sm font-semibold mt-1 break-words">
              Currently Active App: {appName || "Unnamed App"}{" "}
              <span className="font-normal text-muted-foreground">(App ID: {appId})</span>
            </p>
          ) : (
            <p className="text-sm font-semibold mt-1 flex items-center gap-1.5">
              <ShieldQuestion size={14} className="text-amber-600" />
              No active Meta app detected
            </p>
          )}
        </div>
        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={load} disabled={loading} aria-label="Re-check Meta app">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {(error || data?.error) && (
        <p className="text-[10px] text-destructive mt-2 break-words">{error || data?.error}</p>
      )}

      {data && (
        <div className="mt-2 grid gap-1.5 text-[10px] text-muted-foreground sm:grid-cols-2">
          <div>
            <span className="font-semibold text-foreground">Token: </span>
            {data.token?.type || "unknown"} · {data.token?.isValid ? "valid" : "invalid"} ·{" "}
            {data.config?.tokenFingerprint || "—"}
          </div>
          <div>
            <span className="font-semibold text-foreground">Owner: </span>
            {data.token?.ownerName || "—"}
            {data.token?.ownerId ? ` (${data.token.ownerId})` : ""}
          </div>
          <div>
            <span className="font-semibold text-foreground">Expires: </span>
            {data.token?.neverExpires
              ? "never"
              : data.token?.expiresAt
                ? new Date(data.token.expiresAt).toLocaleString()
                : "—"}
          </div>
          <div>
            <span className="font-semibold text-foreground">Feeding inbox: </span>
            Page {data.config?.pageId || "—"}
            {data.config?.instagramAccountId ? ` · IG ${data.config.instagramAccountId}` : ""}
          </div>
        </div>
      )}

      {data?.permissions?.checked && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.permissions.required.map((scope) => {
            const ok = data.permissions!.granted.includes(scope);
            return (
              <Badge
                key={scope}
                variant="outline"
                className={
                  ok
                    ? "text-[10px] border-emerald-300/60 text-emerald-700 dark:text-emerald-400"
                    : "text-[10px] border-amber-300/60 text-amber-700 dark:text-amber-400"
                }
              >
                {ok ? <CheckCircle2 size={10} className="mr-1" /> : <AlertTriangle size={10} className="mr-1" />}
                {scope}
              </Badge>
            );
          })}
        </div>
      )}

      {missing.length > 0 && appId && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-2 leading-snug">
          Add <span className="font-semibold">{missing.join(", ")}</span> to the app{" "}
          <span className="font-semibold">{appName || appId}</span> (App ID {appId}) in your Meta Developer
          console, then regenerate the token and update it in Settings → Connected Platforms.
        </p>
      )}
    </Card>
  );
}
