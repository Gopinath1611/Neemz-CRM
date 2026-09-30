import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FYPageHeader, { NoBranchCard } from "@/components/fy/FYPageHeader";
import SimpleCrudTable from "@/components/fy/SimpleCrudTable";
import { useFYTable } from "@/hooks/useFYTable";
import { getCurrentFY } from "@/lib/fyProjection";

export default function FYClinic() {
  const [fy, setFY] = useState(getCurrentFY());
  const patient = useFYTable("fy_patient_targets", fy);
  const treatment = useFYTable("fy_treatment_targets", fy);
  const chair = useFYTable("chair_utilization_projection", fy);
  const doctor = useFYTable("fy_doctor_targets", fy);

  if (!patient.branchId) return <NoBranchCard />;

  const reloadAll = () => { patient.reload(); treatment.reload(); chair.reload(); doctor.reload(); };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <FYPageHeader title="Clinic Module" description="Patient flow, treatments, chair utilization & doctor targets" fy={fy} onFYChange={setFY} />
      <Card>
        <CardHeader><CardTitle>Clinic Submodules</CardTitle><CardDescription>Plan & track all clinical KPIs for the financial year.</CardDescription></CardHeader>
        <CardContent>
          <Tabs defaultValue="patient">
            <TabsList className="mb-4 flex flex-wrap h-auto">
              <TabsTrigger value="patient">🧑 Patient Target</TabsTrigger>
              <TabsTrigger value="treatment">🦷 Treatment Target</TabsTrigger>
              <TabsTrigger value="chair">🪑 Chair Utilization</TabsTrigger>
              <TabsTrigger value="doctor">👨‍⚕️ Doctor Target</TabsTrigger>
            </TabsList>

            <TabsContent value="patient">
              <SimpleCrudTable
                table="fy_patient_targets" fy={fy} rows={patient.rows} onChanged={patient.reload}
                title="Monthly Patient Flow Target"
                fields={[
                  { key: "month", label: "Month", type: "month", required: true },
                  { key: "new_patient_target", label: "New Patients", type: "number" },
                  { key: "recall_patient_target", label: "Recall Patients", type: "number" },
                  { key: "walk_in_target", label: "Walk-Ins", type: "number" },
                  { key: "referral_target", label: "Referrals", type: "number" },
                  { key: "total_patient_target", label: "Total Target", type: "number" },
                  { key: "daily_avg_target", label: "Daily Avg", type: "number" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>

            <TabsContent value="treatment">
              <SimpleCrudTable
                table="fy_treatment_targets" fy={fy} rows={treatment.rows} onChanged={treatment.reload}
                title="Treatment-wise Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "treatment_name", label: "Treatment", type: "text", required: true, placeholder: "Implant / Ortho / RCT..." },
                  { key: "case_count_target", label: "Case Count", type: "number" },
                  { key: "revenue_target", label: "Revenue", type: "currency" },
                  { key: "avg_case_value", label: "Avg Case Value", type: "currency" },
                  { key: "conversion_target", label: "Conversion %", type: "number" },
                  { key: "notes", label: "Notes", type: "textarea" },
                ]}
              />
            </TabsContent>

            <TabsContent value="chair">
              <SimpleCrudTable
                table="chair_utilization_projection" fy={fy} rows={chair.rows} onChanged={chair.reload}
                title="Chair Utilization Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "total_chairs", label: "Total Chairs", type: "number" },
                  { key: "working_days", label: "Working Days", type: "number" },
                  { key: "working_hours_per_day", label: "Hours/Day", type: "number" },
                  { key: "target_utilization_percent", label: "Utilization %", type: "number" },
                  { key: "expected_patient_load", label: "Patient Load", type: "number" },
                  { key: "expected_revenue_per_chair", label: "Revenue/Chair", type: "currency" },
                ]}
              />
            </TabsContent>

            <TabsContent value="doctor">
              <SimpleCrudTable
                table="fy_doctor_targets" fy={fy} rows={doctor.rows} onChanged={doctor.reload}
                title="Doctor-wise Target"
                fields={[
                  { key: "month", label: "Month", type: "month" },
                  { key: "doctor_name", label: "Doctor", type: "text", required: true },
                  { key: "patient_target", label: "Patients", type: "number" },
                  { key: "case_target", label: "Cases", type: "number" },
                  { key: "revenue_target", label: "Revenue", type: "currency" },
                  { key: "utilization_target", label: "Utilization %", type: "number" },
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
