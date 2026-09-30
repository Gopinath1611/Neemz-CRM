import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, FileText, GraduationCap, ChevronRight } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { Link } from "react-router-dom";

export default function HRExpiryAlertsWidget() {
  const { data: docs = [] } = useQuery({
    queryKey: ["expiring-documents"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_documents")
        .select("id, document_name, expiry_date, reminder_days, employees(first_name, last_name), document_categories(name)")
        .not("expiry_date", "is", null)
        .order("expiry_date", { ascending: true });
      return data || [];
    },
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ["expiring-trainings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_trainings")
        .select("id, certificate_expiry_date, reminder_days, employees(first_name, last_name), training_programs(name)")
        .not("certificate_expiry_date", "is", null)
        .order("certificate_expiry_date", { ascending: true });
      return data || [];
    },
  });

  const docAlerts = docs.filter((d: any) => differenceInDays(parseISO(d.expiry_date), new Date()) <= (d.reminder_days || 15));
  const trainAlerts = trainings.filter((t: any) => differenceInDays(parseISO(t.certificate_expiry_date), new Date()) <= (t.reminder_days || 15));

  if (docAlerts.length === 0 && trainAlerts.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          HR Expiry Alerts
          <Badge variant="destructive" className="ml-auto">{docAlerts.length + trainAlerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {docAlerts.slice(0, 3).map((d: any) => {
          const days = differenceInDays(parseISO(d.expiry_date), new Date());
          return (
            <div key={d.id} className="flex items-center justify-between bg-card rounded-md p-2 border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={14} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{d.document_categories?.name} — {d.employees?.first_name} {d.employees?.last_name}</p>
                  <p className="text-xs text-muted-foreground">Expires {format(parseISO(d.expiry_date), "dd MMM yyyy")}</p>
                </div>
              </div>
              <Badge variant={days < 0 ? "destructive" : "secondary"} className={days >= 0 ? "bg-amber-100 text-amber-700 border-amber-300" : ""}>
                <CalendarClock size={10} className="mr-1" />{days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
              </Badge>
            </div>
          );
        })}
        {trainAlerts.slice(0, 3).map((t: any) => {
          const days = differenceInDays(parseISO(t.certificate_expiry_date), new Date());
          return (
            <div key={t.id} className="flex items-center justify-between bg-card rounded-md p-2 border">
              <div className="flex items-center gap-2 min-w-0">
                <GraduationCap size={14} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.training_programs?.name} — {t.employees?.first_name} {t.employees?.last_name}</p>
                  <p className="text-xs text-muted-foreground">Cert expires {format(parseISO(t.certificate_expiry_date), "dd MMM yyyy")}</p>
                </div>
              </div>
              <Badge variant={days < 0 ? "destructive" : "secondary"} className={days >= 0 ? "bg-amber-100 text-amber-700 border-amber-300" : ""}>
                <CalendarClock size={10} className="mr-1" />{days < 0 ? `${Math.abs(days)}d ago` : `${days}d left`}
              </Badge>
            </div>
          );
        })}
        <div className="flex gap-2">
          {docAlerts.length > 0 && <Button variant="ghost" size="sm" className="flex-1" asChild><Link to="/document-management">Documents <ChevronRight size={14} /></Link></Button>}
          {trainAlerts.length > 0 && <Button variant="ghost" size="sm" className="flex-1" asChild><Link to="/training">Training <ChevronRight size={14} /></Link></Button>}
        </div>
      </CardContent>
    </Card>
  );
}
