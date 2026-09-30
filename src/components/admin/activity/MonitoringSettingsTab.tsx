import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Database, Clock } from "lucide-react";

const MONITORED_TABLES = [
  "patients",
  "appointments",
  "treatment_plans",
  "treatment_plan_items",
  "billings",
  "billing_payments",
  "expenses",
];

const MonitoringSettingsTab = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            Monitored Tables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MONITORED_TABLES.map((table) => (
              <Badge key={table} variant="outline" className="font-mono text-xs">
                {table}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Retention Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">1 year</p>
          <p className="text-sm text-muted-foreground mt-1">
            Activity logs older than this are automatically purged.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Read-Only Reporting
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Recording is read-only reporting; original operations are never blocked.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default MonitoringSettingsTab;
