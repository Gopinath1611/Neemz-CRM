import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Users } from "lucide-react";
import CampQRViewDialog from "@/components/campaigns/CampQRViewDialog";

interface CampaignRow {
  id: string;
  name: string;
  camp_code: string | null;
  campaign_type: string;
  qr_enabled: boolean;
  campaign_date: string | null;
  registrant_count?: number;
}

const CampQRTab = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [qrFor, setQrFor] = useState<CampaignRow | null>(null);

  const load = async () => {
    const { data: camps } = await supabase
      .from("campaigns")
      .select("id, name, camp_code, campaign_type, qr_enabled, campaign_date")
      .order("created_at", { ascending: false });
    if (!camps) return;
    const { data: leads } = await supabase
      .from("screening_leads")
      .select("campaign_id")
      .eq("source", "qr");
    const counts: Record<string, number> = {};
    (leads || []).forEach((l: any) => { counts[l.campaign_id] = (counts[l.campaign_id] || 0) + 1; });
    setCampaigns(camps.map((c: any) => ({ ...c, registrant_count: counts[c.id] || 0 })));
  };

  useEffect(() => { load(); }, []);

  const toggleQr = async (camp: CampaignRow, enabled: boolean) => {
    const { error } = await supabase.from("campaigns").update({ qr_enabled: enabled }).eq("id", camp.id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: enabled ? "QR enabled" : "QR disabled" });
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <QrCode className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Camp QR Codes</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Enable QR for any camp, then download/print and place at the institution. Visitors scan and self-register — they get a unique ID to show the doctor.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Camp</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">QR Active</TableHead>
                <TableHead className="text-center">Registered</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No campaigns yet. Create one in the Campaigns tab.</TableCell></TableRow>
              )}
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.camp_code || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{c.campaign_type}</Badge></TableCell>
                  <TableCell className="text-xs">{c.campaign_date || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={c.qr_enabled} onCheckedChange={(v) => toggleQr(c, v)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-sm"><Users className="h-3 w-3" />{c.registrant_count}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={!c.qr_enabled} onClick={() => setQrFor(c)}>
                      <QrCode className="h-3 w-3 mr-1" /> View QR
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CampQRViewDialog campaign={qrFor} onClose={() => setQrFor(null)} />
    </div>
  );
};

export default CampQRTab;
