import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface MarketingProps {
  leads: any[];
  campaigns: any[];
  contentCalendar: any[];
}

const COLORS = ["hsl(217,91%,50%)", "hsl(330,80%,55%)", "hsl(38,92%,50%)", "hsl(142,71%,45%)", "hsl(172,66%,40%)", "hsl(199,89%,48%)", "hsl(0,72%,51%)"];

const MarketingReport = ({ leads, campaigns, contentCalendar }: MarketingProps) => {
  // Lead Source breakdown
  const sourceCounts: Record<string, { leads: number; converted: number }> = {};
  leads.forEach((l: any) => {
    const src = l.source || "unknown";
    if (!sourceCounts[src]) sourceCounts[src] = { leads: 0, converted: 0 };
    sourceCounts[src].leads++;
    if (l.status === "converted") sourceCounts[src].converted++;
  });

  const sourceData = Object.entries(sourceCounts)
    .sort((a, b) => b[1].leads - a[1].leads)
    .map(([source, data], i) => ({
      source: source.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      leads: data.leads,
      converted: data.converted,
      conversion: data.leads > 0 ? Math.round((data.converted / data.leads) * 100) : 0,
      color: COLORS[i % COLORS.length],
    }));

  const totalLeads = leads.length;
  const totalConverted = leads.filter((l: any) => l.status === "converted").length;
  const convRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0;

  // Campaign stats
  const totalCampaigns = campaigns.length;
  const sentCampaigns = campaigns.filter((c: any) => c.status === "sent").length;
  const totalRecipients = campaigns.reduce((a: number, c: any) => a + (c.total_recipients || 0), 0);
  const totalResponses = campaigns.reduce((a: number, c: any) => a + (c.response_count || 0), 0);

  // Social media stats
  const socialContent = contentCalendar.length;
  const aiGenerated = contentCalendar.filter((c: any) => c.ai_generated).length;
  const published = contentCalendar.filter((c: any) => c.status === "published").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Leads", value: totalLeads },
          { label: "Converted", value: `${totalConverted} (${convRate}%)` },
          { label: "Campaigns Sent", value: `${sentCampaigns}/${totalCampaigns}` },
          { label: "Content Created", value: socialContent },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lead Source Chart */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Leads by Source</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={sourceData} dataKey="leads" nameKey="source" cx="50%" cy="50%" outerRadius={80} innerRadius={30}>
                    {sourceData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {sourceData.map(s => (
                  <div key={s.source} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span>{s.source}</span>
                    </div>
                    <span className="font-medium">{s.leads}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Source Conversion */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Source Conversion</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData.slice(0, 7)}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="source" tick={{ fill: "hsl(220,10%,46%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} />
                <Tooltip />
                <Bar dataKey="leads" fill="hsl(217,91%,50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Lead Source Table */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Lead Source Performance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Source</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Leads</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Converted</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Conversion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sourceData.length > 0 ? sourceData.map(s => (
                <tr key={s.source} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium">{s.source}</td>
                  <td className="px-5 py-3 text-sm">{s.leads}</td>
                  <td className="px-5 py-3 text-sm text-success font-medium">{s.converted}</td>
                  <td className="px-5 py-3 text-sm">
                    <Badge variant="outline" className="text-xs">{s.conversion}%</Badge>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-muted-foreground">No lead data yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Campaign & Social */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xl font-bold font-display">{totalRecipients}</p>
            <p className="text-xs text-muted-foreground">Total Recipients Reached</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xl font-bold font-display">{totalResponses}</p>
            <p className="text-xs text-muted-foreground">Campaign Responses</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-4">
            <p className="text-xl font-bold font-display">{aiGenerated}/{socialContent}</p>
            <p className="text-xs text-muted-foreground">AI Generated Content</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MarketingReport;
