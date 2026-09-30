import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ModuleStat {
  module: string;
  visits: number;
  crudCount: number;
  topUsers: string[];
}

export interface ModuleActivityViewProps {
  moduleStats: ModuleStat[];
}

const ModuleActivityView = ({ moduleStats }: ModuleActivityViewProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {moduleStats.length === 0 && (
        <p className="text-sm text-muted-foreground col-span-full text-center py-8">
          No module activity found.
        </p>
      )}
      {moduleStats.map((m) => (
        <Card key={m.module}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              {m.module}
              <Badge variant="outline">{m.visits} visits</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">CRUD Actions</span>
              <span className="font-medium">{m.crudCount}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Top Users: </span>
              <span>{m.topUsers.join(", ") || "—"}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ModuleActivityView;
