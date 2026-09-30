import { useMemo, useState } from "react";
import { Stethoscope, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ToothChart, ToothEntry, ToothCondition } from "./ToothChart";

const conditionLabels: Record<ToothCondition, string> = {
  healthy: "Healthy",
  cavity: "Cavity / Decay",
  grossly_decayed: "Grossly Decayed",
  missing: "Missing",
  crown: "Crown",
  rct: "Root Canal (RCT)",
  filling: "Filling",
  implant: "Implant",
  bridge: "Bridge",
  fracture: "Fracture",
  mobility: "Mobility",
  impacted: "Impacted",
  ortho: "Root Stumps",
  scaling: "Scaling",
  consultation: "Consultation",
  cd: "CD",
  full_mouth_implant: "Full Mouth Implant",
  cervical_abrasion: "Cervical Abrasion",
  attrition: "Attrition",
};

const conditionBadge: Partial<Record<ToothCondition, string>> = {
  cavity: "bg-red-50 border-red-300 text-red-700",
  grossly_decayed: "bg-red-100 border-red-400 text-red-800",
  missing: "bg-gray-100 border-gray-400 text-gray-600",
  crown: "bg-amber-50 border-amber-300 text-amber-700",
  rct: "bg-purple-50 border-purple-300 text-purple-700",
  filling: "bg-blue-50 border-blue-300 text-blue-700",
  implant: "bg-cyan-50 border-cyan-300 text-cyan-700",
  bridge: "bg-orange-50 border-orange-300 text-orange-700",
  fracture: "bg-rose-50 border-rose-300 text-rose-700",
  mobility: "bg-yellow-50 border-yellow-300 text-yellow-700",
  impacted: "bg-indigo-50 border-indigo-300 text-indigo-700",
  ortho: "bg-green-50 border-green-300 text-green-700",
  scaling: "bg-sky-50 border-sky-300 text-sky-700",
  consultation: "bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700",
  cd: "bg-pink-50 border-pink-300 text-pink-700",
  full_mouth_implant: "bg-teal-50 border-teal-300 text-teal-700",
  cervical_abrasion: "bg-amber-50 border-amber-400 text-amber-800",
  attrition: "bg-slate-50 border-slate-400 text-slate-700",
};

const getQuadrant = (tooth: number): string => {
  const first = String(tooth)[0];
  if (first === "1" || first === "5") return "Q1";
  if (first === "2" || first === "6") return "Q2";
  if (first === "3" || first === "7") return "Q3";
  if (first === "4" || first === "8") return "Q4";
  return "—";
};

interface Props {
  entries: ToothEntry[];
  generalFindings: Array<{ condition: ToothCondition; treatment_needed?: string }>;
  chartType?: "adult" | "child";
}

export const ClinicalFindingsSummary = ({ entries, generalFindings, chartType = "adult" }: Props) => {
  const [open, setOpen] = useState(false);

  const findings = useMemo(
    () => entries.filter((e) => e.condition !== "healthy"),
    [entries],
  );

  const grouped = useMemo(() => {
    const map = new Map<ToothCondition, number[]>();
    findings.forEach((f) => {
      const arr = map.get(f.condition) ?? [];
      if (!arr.includes(f.tooth_number)) arr.push(f.tooth_number);
      map.set(f.condition, arr);
    });
    return Array.from(map.entries()).map(([condition, teeth]) => ({
      condition,
      teeth: teeth.sort((a, b) => a - b),
    }));
  }, [findings]);

  const isEmpty = grouped.length === 0 && generalFindings.length === 0;

  return (
    <>
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Stethoscope size={16} className="text-primary" />
              Clinical Findings (Current Consultation)
              {!isEmpty && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  {grouped.reduce((s, g) => s + g.teeth.length, 0) + generalFindings.length}
                </Badge>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setOpen(true)}
            >
              <Eye size={13} /> View Dental Chart
            </Button>
          </div>

          {isEmpty ? (
            <p className="text-xs text-muted-foreground italic">
              No clinical findings recorded for this consultation.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {grouped.map((g) =>
                g.teeth.map((t) => (
                  <Badge
                    key={`${g.condition}-${t}`}
                    variant="outline"
                    className={cn(
                      "text-[11px] font-medium border px-2 py-0.5 gap-1",
                      conditionBadge[g.condition] ?? "",
                    )}
                  >
                    <span className="font-semibold">#{t}</span>
                    <span className="opacity-70">·</span>
                    <span className="opacity-80">{getQuadrant(t)}</span>
                    <span className="opacity-70">·</span>
                    <span>{conditionLabels[g.condition]}</span>
                  </Badge>
                )),
              )}
              {generalFindings.map((gf) => (
                <Badge
                  key={`gen-${gf.condition}`}
                  variant="outline"
                  className={cn(
                    "text-[11px] font-medium border px-2 py-0.5 gap-1",
                    conditionBadge[gf.condition] ?? "",
                  )}
                >
                  <span className="font-semibold">Full Mouth</span>
                  <span className="opacity-70">·</span>
                  <span>{conditionLabels[gf.condition]}</span>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope size={18} className="text-primary" />
              Dental Chart — Consultation (Read-only)
            </DialogTitle>
          </DialogHeader>
          <ToothChart
            entries={entries}
            generalFindings={generalFindings}
            chartType={chartType}
            onToothClick={() => {}}
            onSaveEntry={() => {}}
            readOnly
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
