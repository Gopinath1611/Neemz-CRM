import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import FYRoiDashboard, { FYRoiCategory } from "@/components/fy/FYRoiDashboard";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";

const PLATFORM_OPTIONS = [
  { value: "meta", label: "Meta (Facebook/Instagram)" },
  { value: "google", label: "Google Ads" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "other", label: "Other" },
];

const PLATFORM_MATCHERS: Record<string, string[]> = {
  meta: ["meta", "facebook", "instagram", "fb", "ig"],
  google: ["google"],
  youtube: ["youtube", "yt"],
  linkedin: ["linkedin"],
  tiktok: ["tiktok"],
  other: [],
};

const CATEGORIES: FYRoiCategory[] = PLATFORM_OPTIONS.map(o => ({ key: o.value, label: o.label }));

function matchPlatform(source: string | null | undefined): string | null {
  if (!source) return null;
  const s = source.toLowerCase();
  for (const [key, matchers] of Object.entries(PLATFORM_MATCHERS)) {
    if (matchers.some(m => s.includes(m))) return key;
  }
  return "other";
}

export default function FYDigitalMarketingROI() {
  const [fy, setFY] = useState(getCurrentFY());
  const t = useFYTable("fy_digital_marketing_roi_targets", fy);
  if (!t.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="📱 Digital Marketing ROI" description="Per-platform ad spend vs revenue & ROAS — auto-tracked from leads" fy={fy} onFYChange={setFY} />

      <FYRoiDashboard
        rows={t.rows}
        fy={fy}
        categoryField="platform"
        spendField="ad_spend_target"
        revenueField="revenue_target"
        leadsField="leads_target"
        categories={CATEGORIES}
        primaryMetricLabel="Revenue"
        fetchRangeActuals={async (start, end) => {
          const { data } = await (supabase as any)
            .from("leads")
            .select("id, source, status, estimated_value, created_at")
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString());
          const revenue: Record<string, number> = {};
          const leads: Record<string, number> = {};
          (data ?? []).forEach((l: any) => {
            const k = matchPlatform(l.source);
            if (!k) return;
            leads[k] = (leads[k] ?? 0) + 1;
            if ((l.status ?? "").toString().toLowerCase().includes("convert")) {
              revenue[k] = (revenue[k] ?? 0) + Number(l.estimated_value ?? 0);
            }
          });
          return { revenue, leads, spend: {}, conversions: {} };
        }}
        fetchMonthlyActuals={async (fyArg) => {
          const startYear = parseInt(fyArg.split("-")[0], 10);
          const start = new Date(startYear, 3, 1);
          const end = new Date(startYear + 1, 2, 31, 23, 59, 59);
          const { data } = await (supabase as any)
            .from("leads")
            .select("id, source, status, estimated_value, created_at")
            .gte("created_at", start.toISOString())
            .lte("created_at", end.toISOString());
          const revenue: Record<number, Record<string, number>> = {};
          const leads: Record<number, Record<string, number>> = {};
          (data ?? []).forEach((l: any) => {
            const m = new Date(l.created_at).getMonth() + 1;
            const k = matchPlatform(l.source);
            if (!k) return;
            revenue[m] = revenue[m] || {};
            leads[m] = leads[m] || {};
            leads[m][k] = (leads[m][k] ?? 0) + 1;
            if ((l.status ?? "").toString().toLowerCase().includes("convert")) {
              revenue[m][k] = (revenue[m][k] ?? 0) + Number(l.estimated_value ?? 0);
            }
          });
          return { revenue, leads, spend: {}, conversions: {} };
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Manage Digital Marketing ROI Targets</CardTitle>
          <CardDescription>Plan ad spend, revenue, leads & ROAS per platform per month.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_digital_marketing_roi_targets" fy={fy} rows={t.rows} onChanged={t.reload}
            title="Digital Marketing ROI Plan"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "platform", label: "Platform", type: "select", options: PLATFORM_OPTIONS, manageableKey: "digital_platforms" },
              { key: "ad_spend_target", label: "Ad Spend", type: "currency" },
              { key: "leads_target", label: "Leads", type: "number" },
              { key: "revenue_target", label: "Revenue", type: "currency" },
              { key: "roas_target", label: "ROAS (x)", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
