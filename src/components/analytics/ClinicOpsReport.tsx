import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, CalendarCheck, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

interface ClinicOpsProps {
  patients: any[];
  appointments: any[];
  checkins: any[];
  treatmentPlans: any[];
  treatmentItems: any[];
}

const ClinicOpsReport = ({ patients, appointments, checkins, treatmentPlans, treatmentItems }: ClinicOpsProps) => {
  const today = new Date().toISOString().split("T")[0];
  const todayAppts = appointments.filter((a: any) => a.appointment_date === today);
  const totalAppts = appointments.length;
  const cancelledAppts = appointments.filter((a: any) => a.status === "cancelled").length;
  const noShowAppts = appointments.filter((a: any) => a.status === "no_show").length;
  const cancelRate = totalAppts > 0 ? Math.round((cancelledAppts / totalAppts) * 100) : 0;
  const noShowRate = totalAppts > 0 ? Math.round((noShowAppts / totalAppts) * 100) : 0;

  const newPatients = patients.filter((p: any) => {
    const created = new Date(p.created_at);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return created >= thirtyDaysAgo;
  }).length;
  const returningPatients = patients.length - newPatients;

  // Treatment stats
  const treatmentCounts: Record<string, number> = {};
  treatmentItems.forEach((item: any) => {
    treatmentCounts[item.treatment_type] = (treatmentCounts[item.treatment_type] || 0) + 1;
  });
  const topTreatments = Object.entries(treatmentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }));

  const completedTreatments = treatmentItems.filter((i: any) => i.status === "completed").length;
  const treatmentCompletionRate = treatmentItems.length > 0 ? Math.round((completedTreatments / treatmentItems.length) * 100) : 0;

  // Hourly distribution
  const hourlyData = Array.from({ length: 12 }, (_, i) => {
    const hour = i + 8;
    const label = `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? "PM" : "AM"}`;
    const count = appointments.filter((a: any) => {
      const h = parseInt(a.start_time?.split(":")[0] || "0");
      return h === hour;
    }).length;
    return { hour: label, patients: count };
  });

  const walkIns = appointments.filter((a: any) => a.source === "walk-in").length;
  const scheduled = totalAppts - walkIns;

  const patientFlowData = [
    { name: "New", value: newPatients },
    { name: "Returning", value: returningPatients },
    { name: "Walk-in", value: walkIns },
    { name: "Appointment", value: scheduled },
  ];

  return (
    <div className="space-y-6">
      {/* Patient Flow Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Today's Patients", value: todayAppts.length, icon: Users, color: "text-primary" },
          { label: "New (30d)", value: newPatients, icon: Activity, color: "text-success" },
          { label: "Walk-in vs Appt", value: `${walkIns} / ${scheduled}`, icon: Clock, color: "text-accent" },
          { label: "Active Patients", value: patients.length, icon: CalendarCheck, color: "text-warning" },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <s.icon size={16} className={`${s.color} mb-2`} />
              <p className="text-2xl font-bold font-display">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Appointment Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Appointments", value: totalAppts },
          { label: "Cancellation Rate", value: `${cancelRate}%` },
          { label: "No-Show Rate", value: `${noShowRate}%` },
          { label: "Treatment Completion", value: `${treatmentCompletionRate}%` },
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
        {/* Peak Hours */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Peak Hours</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fill: "hsl(220,10%,46%)", fontSize: 10 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} />
                <Tooltip />
                <Bar dataKey="patients" fill="hsl(217,91%,50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Patient Flow */}
        <Card className="shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-base font-display">Patient Flow</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={patientFlowData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fill: "hsl(220,10%,46%)", fontSize: 11 }} />
                <YAxis tick={{ fill: "hsl(220,10%,46%)" }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(172,66%,40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Treatments */}
      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base font-display">Most Common Treatments</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Treatment</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topTreatments.length > 0 ? topTreatments.map(t => (
                <tr key={t.name} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium">{t.name}</td>
                  <td className="px-5 py-3 text-sm">{t.count}</td>
                </tr>
              )) : (
                <tr><td colSpan={2} className="px-5 py-6 text-center text-sm text-muted-foreground">No treatment data yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClinicOpsReport;
