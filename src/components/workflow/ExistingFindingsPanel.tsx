import { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { History, Stethoscope, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  fetchOpenFindings,
  addStatusEvent,
  OpenFinding,
  FindingStatus,
  STATUS_LABEL,
  STATUS_COLOR,
} from "@/lib/findingsLifecycle";

interface Props {
  patientId: string | null;
  checkinId?: string | null;
  appointmentId?: string | null;
  doctor?: string | null;
  workflowDateISO?: string;
}

const ACTIONS: { status: FindingStatus; label: string; variant?: "default" | "secondary" | "outline" | "destructive" }[] = [
  { status: "continuing", label: "Continue Tx", variant: "default" },
  { status: "monitoring", label: "Monitor", variant: "secondary" },
  { status: "resolved", label: "Resolved", variant: "outline" },
  { status: "recurred", label: "Recurred", variant: "destructive" },
];

export const ExistingFindingsPanel = ({ patientId, checkinId, appointmentId, doctor, workflowDateISO }: Props) => {
  const { toast } = useToast();
  const [findings, setFindings] = useState<OpenFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeFinding, setActiveFinding] = useState<OpenFinding | null>(null);
  const [activeStatus, setActiveStatus] = useState<FindingStatus>("continuing");
  const [progressNote, setProgressNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) {
      setFindings([]);
      return;
    }
    setLoading(true);
    const data = await fetchOpenFindings(patientId);
    // Show only items whose latest status is NOT resolved
    setFindings(data.filter((f) => f.latest_status !== "resolved"));
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (f: OpenFinding, status: FindingStatus) => {
    setActiveFinding(f);
    setActiveStatus(status);
    setProgressNote("");
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!activeFinding) return;
    setSubmitting(true);
    const res = await addStatusEvent({
      findingId: activeFinding.id,
      patientId: activeFinding.patient_id,
      checkinId,
      appointmentId,
      doctor: doctor || activeFinding.doctor,
      previousStatus: activeFinding.latest_status,
      newStatus: activeStatus,
      progressNote: progressNote.trim() || null,
      eventDateISO: workflowDateISO,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast({ title: "Could not update", description: res.error, variant: "destructive" });
      return;
    }
    toast({
      title: `Marked ${STATUS_LABEL[activeStatus]}`,
      description: `Tooth ${activeFinding.tooth_number ?? "General"} · ${activeFinding.condition}`,
    });
    setDialogOpen(false);
    load();
  };

  if (!patientId) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <History size={16} className="text-amber-700" />
            Existing Findings (from previous visits)
            <Badge variant="secondary" className="ml-1 text-[10px]">{findings.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : findings.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No active findings from prior visits. Any new findings recorded below will start a fresh lifecycle.
            </p>
          ) : (
            <div className="space-y-2">
              {findings.map((f) => (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs"
                >
                  <Badge variant="outline" className="font-semibold">
                    {f.tooth_number ? `#${f.tooth_number}` : "Full Mouth"}
                  </Badge>
                  <span className="font-medium">{f.condition}</span>
                  {f.treatment_needed && (
                    <span className="text-muted-foreground">→ {f.treatment_needed}</span>
                  )}
                  <Badge variant="outline" className={STATUS_COLOR[f.latest_status]}>
                    {STATUS_LABEL[f.latest_status]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Originally: {format(new Date(f.recorded_at), "dd MMM yyyy")}
                  </span>
                  <div className="flex flex-wrap gap-1 w-full sm:w-auto">
                    {ACTIONS.map((a) => (
                      <Button
                        key={a.status}
                        size="sm"
                        variant={a.variant}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => openDialog(f, a.status)}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope size={16} /> Update Finding Status
            </DialogTitle>
          </DialogHeader>
          {activeFinding && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-2 bg-muted/30">
                <div className="font-medium">
                  {activeFinding.tooth_number ? `Tooth #${activeFinding.tooth_number}` : "Full Mouth"} · {activeFinding.condition}
                </div>
                <div className="text-xs text-muted-foreground">
                  Current: {STATUS_LABEL[activeFinding.latest_status]} → New: <strong>{STATUS_LABEL[activeStatus]}</strong>
                </div>
              </div>
              <div>
                <Label className="text-xs">Progress Note (optional)</Label>
                <Textarea
                  rows={3}
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  placeholder="e.g. RCT obturation done, scheduling crown next visit"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Record Event"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ExistingFindingsPanel;
