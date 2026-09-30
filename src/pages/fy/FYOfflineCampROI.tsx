import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import FYRoiDashboard, { FYRoiCategory } from "@/components/fy/FYRoiDashboard";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";
import { supabase } from "@/integrations/supabase/client";

const CAMP_TYPE_OPTIONS = [
  { value: "school", label: "School Camp" },
  { value: "college", label: "College Camp" },
  { value: "corporate", label: "Corporate Camp" },
  { value: "community", label: "Community Camp" },
  { value: "rwa", label: "RWA / Apartment" },
  { value: "other", label: "Other" },
];

const CATEGORIES: FYRoiCategory[] = CAMP_TYPE_OPTIONS.map(o => ({ key: o.value, label: o.label }));

function matchCampType(t: string | null | undefined): string {
  const s = (t ?? "").toString().toLowerCase();
  if (s.includes("school")) return "school";
  if (s.includes("college")) return "college";
  if (s.includes("corp")) return "corporate";
  if (s.includes("rwa") || s.includes("apartment")) return "rwa";
  if (s.includes("community")) return "community";
  return "other";
}

export default function FYOfflineCampROI() {
  const [fy, setFY] = useState(getCurrentFY());
  const t = useFYTable("fy_offline_camp_roi_targets", fy);
  if (!t.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="🏕️ Offline Camp ROI" description="Camp spend vs revenue — auto-tracked from campaigns & screening leads" fy={fy} onFYChange={setFY} />

      <FYRoiDashboard
        rows={t.rows}
        fy={fy}
        categoryField="camp_type"
        spendField="spend_target"
        revenueField="revenue_target"
        leadsField="participants_target"
        conversionsField="conversions_target"
        categories={CATEGORIES}
        primaryMetricLabel="Revenue"
        fetchRangeActuals={async (start, end) => {
          const startISO = start.toISOString().slice(0, 10);
          const endISO = end.toISOString().slice(0, 10);
          // Camps + cost
          const { data: camps } = await (supabase as any)
            .from("campaigns")
            .select("id, campaign_type, actual_cost, estimated_cost, campaign_date")
            .gte("campaign_date", startISO)
            .lte("campaign_date", endISO);
          const spend: Record<string, number> = {};
          const campIds: string[] = [];
          const campIdToType: Record<string, string> = {};
          (camps ?? []).forEach((c: any) => {
            const k = matchCampType(c.campaign_type);
            spend[k] = (spend[k] ?? 0) + Number(c.actual_cost ?? c.estimated_cost ?? 0);
            campIds.push(c.id);
            campIdToType[c.id] = k;
          });
          // Screening leads → participants & conversions
          const leads: Record<string, number> = {};
          const conversions: Record<string, number> = {};
          const revenue: Record<string, number> = {};
          if (campIds.length) {
            const { data: sleads } = await (supabase as any)
              .from("screening_leads")
              .select("id, campaign_id, converted_to_patient, followup_status")
              .in("campaign_id", campIds);
            (sleads ?? []).forEach((l: any) => {
              const k = campIdToType[l.campaign_id];
              if (!k) return;
              leads[k] = (leads[k] ?? 0) + 1;
              const fst = (l.followup_status ?? "").toString().toLowerCase();
              if (l.converted_to_patient || fst.includes("convert")) {
                conversions[k] = (conversions[k] ?? 0) + 1;
              }
            });
          }
          // Revenue actuals not directly tracked at screening level; leave empty.
          return { spend, leads, conversions, revenue };
        }}
        fetchMonthlyActuals={async (fyArg) => {
          const startYear = parseInt(fyArg.split("-")[0], 10);
          const startISO = `${startYear}-04-01`;
          const endISO = `${startYear + 1}-03-31`;
          const { data: camps } = await (supabase as any)
            .from("campaigns")
            .select("id, campaign_type, actual_cost, estimated_cost, campaign_date")
            .gte("campaign_date", startISO)
            .lte("campaign_date", endISO);
          const spend: Record<number, Record<string, number>> = {};
          const campIdToMeta: Record<string, { m: number; k: string }> = {};
          (camps ?? []).forEach((c: any) => {
            const m = new Date(c.campaign_date).getMonth() + 1;
            const k = matchCampType(c.campaign_type);
            spend[m] = spend[m] || {};
            spend[m][k] = (spend[m][k] ?? 0) + Number(c.actual_cost ?? c.estimated_cost ?? 0);
            campIdToMeta[c.id] = { m, k };
          });
          const revenue: Record<number, Record<string, number>> = {};
          const leads: Record<number, Record<string, number>> = {};
          const conversions: Record<number, Record<string, number>> = {};
          const ids = Object.keys(campIdToMeta);
          if (ids.length) {
            const { data: sleads } = await (supabase as any)
              .from("screening_leads")
              .select("id, campaign_id, converted_to_patient, followup_status")
              .in("campaign_id", ids);
            (sleads ?? []).forEach((l: any) => {
              const meta = campIdToMeta[l.campaign_id];
              if (!meta) return;
              leads[meta.m] = leads[meta.m] || {};
              leads[meta.m][meta.k] = (leads[meta.m][meta.k] ?? 0) + 1;
              const fst = (l.followup_status ?? "").toString().toLowerCase();
              if (l.converted_to_patient || fst.includes("convert")) {
                conversions[meta.m] = conversions[meta.m] || {};
                conversions[meta.m][meta.k] = (conversions[meta.m][meta.k] ?? 0) + 1;
              }
            });
          }
          // Revenue actuals not directly tracked at screening level.
          return { spend, revenue, leads, conversions };
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Manage Offline Camp ROI Targets</CardTitle>
          <CardDescription>Plan spend, participants, conversions, revenue & ROI per camp type per month.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleCrudTable
            table="fy_offline_camp_roi_targets" fy={fy} rows={t.rows} onChanged={t.reload}
            title="Offline Camp ROI Plan"
            fields={[
              { key: "month", label: "Month", type: "month" },
              { key: "camp_type", label: "Camp Type", type: "select", options: CAMP_TYPE_OPTIONS, manageableKey: "camp_types" },
              { key: "spend_target", label: "Spend", type: "currency" },
              { key: "participants_target", label: "Participants", type: "number" },
              { key: "conversions_target", label: "Conversions", type: "number" },
              { key: "revenue_target", label: "Revenue", type: "currency" },
              { key: "roi_target", label: "ROI (x)", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
