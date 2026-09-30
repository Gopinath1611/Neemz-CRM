import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  UserCheck,
  UserX,
  Activity,
  Eye,
  Database,
  AlertTriangle,
  LucideIcon,
} from "lucide-react";

export interface KpiCardsProps {
  onlineUsers: number;
  totalUsers: number;
  offlineUsers: number;
  activeLast30Min: number;
  pageVisitsToday: number;
  dbActionsToday: number;
  flaggedAnomalies: number;
}

interface KpiItem {
  label: string;
  value: number;
  icon: LucideIcon;
  sublabel?: string;
}

const KpiCards = (props: KpiCardsProps) => {
  const items: KpiItem[] = [
    { label: "Online Users", value: props.onlineUsers, icon: UserCheck },
    { label: "Total Users", value: props.totalUsers, icon: Users },
    { label: "Offline Users", value: props.offlineUsers, icon: UserX },
    { label: "Active (30m)", value: props.activeLast30Min, icon: Activity },
    { label: "Page Visits Today", value: props.pageVisitsToday, icon: Eye },
    { label: "DB Actions Today", value: props.dbActionsToday, icon: Database },
    {
      label: "Flagged Anomalies",
      value: props.flaggedAnomalies,
      icon: AlertTriangle,
      sublabel: "Off-hours only",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
            <span className="text-xl font-semibold leading-none">{item.value}</span>
            {item.sublabel && (
              <span className="text-[10px] text-muted-foreground">{item.sublabel}</span>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default KpiCards;
