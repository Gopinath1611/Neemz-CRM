import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYMarketingHub() {
  const [fy, setFY] = useState(getCurrentFY());
  const ads = useFYTable("fy_ad_targets", fy);
  const social = useFYTable("fy_social_media_targets", fy);
  const camps = useFYTable("fy_offline_camp_targets", fy);

  if (!ads.branchId) return <NoBranchCard />;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Marketing Module" description="Ads, social media & offline camp targets" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Marketing Submodules</CardTitle><CardDescription>Plan campaigns across all channels.</CardDescription></CardHeader>
        <CardContent>
          <Tabs defaultValue="ads">
            <TabsList className="mb-4 flex flex-wrap h-auto">
              <TabsTrigger value="ads">📣 Ad Target</TabsTrigger>
              <TabsTrigger value="social">📱 Social Media Target</TabsTrigger>
              <TabsTrigger value="camps">🏕️ Offline Camp Target</TabsTrigger>
            </TabsList>

            <TabsContent value="ads">
              <SimpleCrudTable
                table="fy_ad_targets" fy={fy} rows={ads.rows} onChanged={ads.reload}
                title="Paid Ads Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "platform", label: "Platform", type: "select", manageableKey: "ad_platforms", options: [
                    { value: "meta_ads", label: "Meta Ads" }, { value: "google_ads", label: "Google Ads" },
                    { value: "youtube_ads", label: "YouTube Ads" }, { value: "linkedin_ads", label: "LinkedIn Ads" },
                    { value: "other", label: "Other" }] },
                  { key: "campaign", label: "Campaign", type: "select", manageableKey: "ad_campaigns", options: [
                    { value: "leads_campaign", label: "Leads Campaign" },
                    { value: "hiring_campaign", label: "Hiring Campaign" },
                    { value: "awareness_campaign", label: "Awareness Campaign" }] },
                  { key: "treatment", label: "Treatment", type: "treatment_select" },
                  { key: "budget", label: "Budget", type: "currency" },
                  { key: "lead_target", label: "Leads", type: "number" },
                  { key: "cpl_target", label: "CPL Target", type: "currency" },
                  { key: "roas_target", label: "ROAS", type: "number" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>

            <TabsContent value="social">
              <SimpleCrudTable
                table="fy_social_media_targets" fy={fy} rows={social.rows} onChanged={social.reload}
                title="Social Media Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "platform", label: "Platform", type: "select", options: [
                    { value: "instagram", label: "Instagram" }, { value: "facebook", label: "Facebook" },
                    { value: "youtube", label: "YouTube" }, { value: "linkedin", label: "LinkedIn" }, { value: "other", label: "Other" }] },
                  { key: "posts_target", label: "Posts", type: "number" },
                  { key: "reach_target", label: "Reach", type: "number" },
                  { key: "engagement_target", label: "Engagement", type: "number" },
                  { key: "follower_growth_target", label: "Follower Growth", type: "number" },
                  { key: "lead_target", label: "Leads", type: "number" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>

            <TabsContent value="camps">
              <SimpleCrudTable
                table="fy_offline_camp_targets" fy={fy} rows={camps.rows} onChanged={camps.reload}
                title="Offline Camp Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "camp_type", label: "Camp Type", type: "select", options: [
                    { value: "school", label: "School" }, { value: "college", label: "College" },
                    { value: "corporate", label: "Corporate" }, { value: "community", label: "Community" }] },
                  { key: "camps_planned", label: "Camps Planned", type: "number" },
                  { key: "expected_screenings", label: "Screenings", type: "number" },
                  { key: "expected_conversions", label: "Conversions", type: "number" },
                  { key: "budget", label: "Budget", type: "currency" },
                  { key: "expected_revenue", label: "Expected Revenue", type: "currency" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
