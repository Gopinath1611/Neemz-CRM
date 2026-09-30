import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IndianRupee, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export type AdSpendRow = {
  id: string;
  platform: string;
  campaign_name: string;
  period_start: string;
  period_end: string;
  amount: number | null;
  notes: string | null;
};

export const SPEND_PLATFORMS = ["Meta", "Google", "Web", "Offline"] as const;

const inr = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const today = () => new Date().toISOString().slice(0, 10);

/** Entry screen for marketing spend per campaign per period. Nothing else in the
 *  app records ad spend, so campaign CPL and ROAS come from what is entered here. */
export default function AdSpendManager({
  rows,
  onChanged,
}: {
  rows: AdSpendRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdSpendRow | null>(null);
  const [platform, setPlatform] = useState<string>("Meta");
  const [campaignName, setCampaignName] = useState("");
  const [periodStart, setPeriodStart] = useState(today());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditing(null);
    setPlatform("Meta");
    setCampaignName("");
    setPeriodStart(today());
    setPeriodEnd(today());
    setAmount("");
    setNotes("");
  };

  const startEdit = (r: AdSpendRow) => {
    setEditing(r);
    setPlatform(r.platform);
    setCampaignName(r.campaign_name);
    setPeriodStart(r.period_start);
    setPeriodEnd(r.period_end);
    setAmount(String(r.amount ?? ""));
    setNotes(r.notes || "");
    setOpen(true);
  };

  const save = async () => {
    if (!campaignName.trim()) return toast.error("Enter the campaign name");
    if (!amount || Number(amount) < 0) return toast.error("Enter a valid amount");
    if (periodEnd < periodStart) return toast.error("End date cannot be before start date");
    setSaving(true);
    const payload = {
      platform,
      campaign_name: campaignName.trim(),
      period_start: periodStart,
      period_end: periodEnd,
      amount: Number(amount),
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("marketing_ad_spend").update(payload).eq("id", editing.id)
      : await supabase.from("marketing_ad_spend").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("policy") ? "You do not have permission to record ad spend" : error.message);
      return;
    }
    toast.success(editing ? "Ad spend updated" : "Ad spend recorded");
    setOpen(false);
    reset();
    onChanged();
  };

  const remove = async (r: AdSpendRow) => {
    const { error } = await supabase.from("marketing_ad_spend").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Entry removed");
    onChanged();
  };

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Ad spend entries</p>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "entry" : "entries"} in the selected period · {inr(total)}
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add Ad Spend
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit ad spend" : "Record ad spend"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SPEND_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Campaign name</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. RCT Lead campaign 03/08/2026"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the exact campaign / form name so spend lines up with the leads it brought in.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From</Label>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Amount (₹)</Label>
                <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                <IndianRupee className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Platform</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No ad spend recorded for this period yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.platform}</Badge></TableCell>
                  <TableCell className="max-w-[240px] truncate">{r.campaign_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.period_start} → {r.period_end}
                  </TableCell>
                  <TableCell className="text-right font-medium">{inr(Number(r.amount || 0))}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
