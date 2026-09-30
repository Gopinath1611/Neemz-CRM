import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, KeyRound, ChevronRight } from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { Link } from "react-router-dom";

export default function LicenseAlertsWidget() {
  const { data: licenses = [] } = useQuery({
    queryKey: ["expiring-licenses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("licenses")
        .select("id, workspace_name, vendor, expiry_date, reminder_days, status")
        .order("expiry_date", { ascending: true });
      return data || [];
    },
  });

  const alerts = licenses.filter((l) => {
    const days = differenceInDays(parseISO(l.expiry_date), new Date());
    return days <= (l.reminder_days || 15);
  });

  if (alerts.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          License Renewal Alerts
          <Badge variant="destructive" className="ml-auto">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.slice(0, 5).map((l) => {
          const days = differenceInDays(parseISO(l.expiry_date), new Date());
          const expired = days < 0;
          return (
            <div key={l.id} className="flex items-center justify-between bg-card rounded-md p-2 border">
              <div className="flex items-center gap-2 min-w-0">
                <KeyRound size={14} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{l.workspace_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.vendor || "License"} • Expires {format(parseISO(l.expiry_date), "dd MMM yyyy")}
                  </p>
                </div>
              </div>
              <Badge variant={expired ? "destructive" : "secondary"} className={!expired ? "bg-amber-100 text-amber-700 border-amber-300" : ""}>
                <CalendarClock size={10} className="mr-1" />
                {expired ? `${Math.abs(days)}d ago` : `${days}d left`}
              </Badge>
            </div>
          );
        })}
        <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
          <Link to="/licenses">Manage All Licenses <ChevronRight size={14} /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
