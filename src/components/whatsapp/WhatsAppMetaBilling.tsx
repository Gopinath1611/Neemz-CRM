/** Verified WhatsApp volume & charges pulled live from Meta (pricing_analytics). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFunctionAuthHeaders } from "@/lib/functionAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";

const RANGES = [
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "90", label: "Last 90 days" },
  { v: "month", label: "This month" },
];
const LABELS: Record<string, string> = {
  MARKETING: "Marketing", UTILITY: "Utility", AUTHENTICATION: "Authentication",
  SERVICE: "Service", MARKETING_LITE: "Marketing Lite",
  REGULAR: "Paid", FREE_ENTRY_POINT: "Free Entry Point", FREE_CUSTOMER_SERVICE: "Customer Service",
};
const nice = (s: string) => LABELS[s] || s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const money = (n: number, c: string) =>
  `~${c === "INR" ? "₹" : `${c} `}${(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rangeSecs = (r: string) => {
  const end = Math.floor(Date.now() / 1000);
  if (r === "month") {
    const n = new Date();
    return { start: Math.floor(new Date(n.getFullYear(), n.getMonth(), 1).getTime() / 1000), end };
  }
  return { start: end - Number(r) * 86400, end };
};

export default function WhatsAppMetaBilling() {
  const [range, setRange] = useState("30");
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["meta-wa-billing", range],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const headers = await getFunctionAuthHeaders();
      const { data, error } = await supabase.functions.invoke("fetch-meta-whatsapp-insights", {
        body: rangeSecs(range), headers,
      });
      if (error) return { ok: false, reason: "server_error", error: error.message };
      return data;
    },
  });

  const cur = data?.currency || "INR";
  const needsSetup = data && !data.ok && ["missing_token", "permission"].includes(data.reason);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary" /> Meta Verified Billing
          </CardTitle>
          <Badge variant="secondary" className="mt-1 text-[10px]">Data sourced directly from Meta Cloud API</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Sync with Meta
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-4">
        {!data && isFetching && <p className="text-muted-foreground">Loading from Meta…</p>}
        {data && !data.ok && (
          <div className="rounded-lg border border-dashed p-4 flex items-start gap-2">
            <AlertCircle size={16} className="text-warning mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium">{needsSetup ? "Meta access needs setup" : "Could not load Meta billing"}</p>
              <p className="text-xs text-muted-foreground break-words">Meta said: {data.error}</p>
              {needsSetup && (
                <p className="text-xs text-muted-foreground">
                  In Meta Business Settings → System Users, generate a token for this WhatsApp account with the
                  <b> whatsapp_business_management</b> and <b>whatsapp_business_messaging</b> permissions, then save it
                  as the WhatsApp system user token.
                </p>
              )}
            </div>
          </div>
        )}
        {data?.ok && (
          <>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Paid messages delivered</p>
              {data.paid.length === 0 ? <p className="text-muted-foreground">None in this period.</p> : (
                <div className="grid gap-2 md:grid-cols-3">
                  {data.paid.map((r: any) => (
                    <div key={r.category} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{nice(r.category)}</p>
                      <p className="font-semibold text-lg">{r.volume.toLocaleString("en-IN")}</p>
                      <p className="text-xs text-muted-foreground">Charges: {r.cost ? money(r.cost, cur) : "Free"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Free messages</p>
              {data.free.length === 0 ? <p className="text-muted-foreground">None in this period.</p> : (
                <div className="grid gap-2 md:grid-cols-3">
                  {data.free.map((r: any) => (
                    <div key={`${r.category}-${r.type}`} className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">{nice(r.type)} · {nice(r.category)}</p>
                      <p className="font-semibold text-lg">{r.volume.toLocaleString("en-IN")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 flex justify-between font-semibold">
              <span>Total approximate charges</span>
              <span>{money(data.totalCost, cur)} {cur}</span>
            </div>
            {(() => {
              const cats = ["MARKETING", "UTILITY", "AUTHENTICATION", "SERVICE"];
              const rows = cats.map((c) => {
                const paid = data.paid.filter((r: any) => r.category === c);
                const free = data.free.filter((r: any) => r.category === c);
                const billed = paid.reduce((s: number, r: any) => s + r.volume, 0);
                const cost = paid.reduce((s: number, r: any) => s + r.cost, 0);
                const freeVol = free.reduce((s: number, r: any) => s + r.volume, 0);
                return { c, billed, cost, freeVol, free };
              });
              const totalPaid = rows.reduce((s, r) => s + r.billed, 0);
              const totalFree = (data.free as any[]).reduce((s, r) => s + r.volume, 0);
              const freeByType: Record<string, number> = {};
              for (const r of data.free as any[]) freeByType[r.type] = (freeByType[r.type] || 0) + r.volume;
              const rate = (r: typeof rows[number]) =>
                r.billed > 0 && r.cost > 0
                  ? `~${cur === "INR" ? "₹" : `${cur} `}${(r.cost / r.billed).toLocaleString("en-IN", { maximumFractionDigits: 3 })}`
                  : r.c === "SERVICE" || r.cost === 0 ? "Free" : "—";
              return (
                <div>
                  <p className="text-sm font-semibold mb-2">Meta Verified Conversation Breakdown</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">Category</th>
                          <th className="text-right p-2">Billed Conversations / Messages</th>
                          <th className="text-left p-2">Free Conversations</th>
                          <th className="text-right p-2">Effective Rate Each</th>
                          <th className="text-right p-2">Total Cost ({cur})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.c} className="border-t">
                            <td className="p-2 font-medium">{nice(r.c)}</td>
                            <td className="p-2 text-right">{r.billed.toLocaleString("en-IN")}</td>
                            <td className="p-2 text-xs text-muted-foreground">
                              {r.free.length ? r.free.map((f: any) => `${nice(f.type)}: ${f.volume.toLocaleString("en-IN")}`).join(", ") : "0"}
                            </td>
                            <td className="p-2 text-right">{rate(r)}</td>
                            <td className="p-2 text-right">{money(r.cost, cur).replace("~", "")}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-muted/30 font-semibold">
                        <tr>
                          <td className="p-2">Totals</td>
                          <td className="p-2 text-right">Total Paid: {totalPaid.toLocaleString("en-IN")}</td>
                          <td className="p-2 text-xs">
                            Total Free: {totalFree.toLocaleString("en-IN")}
                            {Object.keys(freeByType).length > 0 && (
                              <span className="block font-normal text-muted-foreground">
                                {Object.entries(freeByType).map(([t, v]) => `${nice(t)}: ${v.toLocaleString("en-IN")}`).join(", ")}
                              </span>
                            )}
                          </td>
                          <td className="p-2" />
                          <td className="p-2 text-right">Grand Total: {money(data.totalCost, cur).replace("~", "")} {cur}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })()}
            <p className="text-[11px] text-muted-foreground">
              Account {data.wabaId} · synced {new Date(data.fetchedAt).toLocaleString("en-IN")}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
