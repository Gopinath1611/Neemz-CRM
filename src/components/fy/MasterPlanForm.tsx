import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

export default function MasterPlanForm({ initial, onSave }: { initial: any; onSave: (d: any) => void }) {
  const [form, setForm] = useState({
    total_revenue_target: initial?.total_revenue_target || 0,
    op_revenue_target: initial?.op_revenue_target || 0,
    implant_revenue_target: initial?.implant_revenue_target || 0,
    ortho_revenue_target: initial?.ortho_revenue_target || 0,
    cosmetic_revenue_target: initial?.cosmetic_revenue_target || 0,
    general_dentistry_target: initial?.general_dentistry_target || 0,
    total_patient_target: initial?.total_patient_target || 0,
    new_patient_target: initial?.new_patient_target || 0,
    recall_patient_target: initial?.recall_patient_target || 0,
    chair_utilization_target: initial?.chair_utilization_target || 70,
    case_acceptance_target: initial?.case_acceptance_target || 65,
  });
  useEffect(() => {
    if (initial) setForm({
      total_revenue_target: initial.total_revenue_target || 0,
      op_revenue_target: initial.op_revenue_target || 0,
      implant_revenue_target: initial.implant_revenue_target || 0,
      ortho_revenue_target: initial.ortho_revenue_target || 0,
      cosmetic_revenue_target: initial.cosmetic_revenue_target || 0,
      general_dentistry_target: initial.general_dentistry_target || 0,
      total_patient_target: initial.total_patient_target || 0,
      new_patient_target: initial.new_patient_target || 0,
      recall_patient_target: initial.recall_patient_target || 0,
      chair_utilization_target: initial.chair_utilization_target || 70,
      case_acceptance_target: initial.case_acceptance_target || 65,
    });
  }, [initial?.id]);
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: Number(v) || 0 }));
  const fields: { key: keyof typeof form; label: string }[] = [
    { key: "total_revenue_target", label: "Total Revenue Target (₹)" },
    { key: "op_revenue_target", label: "OP Revenue (₹)" },
    { key: "implant_revenue_target", label: "Implant Revenue (₹)" },
    { key: "ortho_revenue_target", label: "Ortho Revenue (₹)" },
    { key: "cosmetic_revenue_target", label: "Cosmetic Revenue (₹)" },
    { key: "general_dentistry_target", label: "General Dentistry (₹)" },
    { key: "total_patient_target", label: "Total Patients" },
    { key: "new_patient_target", label: "New Patients" },
    { key: "recall_patient_target", label: "Recall Patients" },
    { key: "chair_utilization_target", label: "Chair Utilization %" },
    { key: "case_acceptance_target", label: "Case Acceptance %" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <Label className="text-xs">{f.label}</Label>
            <Input type="number" value={form[f.key]} onChange={e => set(f.key, e.target.value)} />
          </div>
        ))}
      </div>
      <Button onClick={() => onSave(form)}><Save className="h-4 w-4 mr-2" /> Save Annual Plan</Button>
    </div>
  );
}
