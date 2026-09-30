import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";

export interface ActivityLogRow {
  id: string;
  time: string;
  userName: string;
  actionType: string;
  module: string;
  description: string;
}

export interface ActivityLogFilters {
  search: string;
  userId: string;
  actionType: string;
  module: string;
  dateFrom: string;
  dateTo: string;
}

export interface ActivityLogsExplorerProps {
  logs: ActivityLogRow[];
  filters: ActivityLogFilters;
  userOptions: { id: string; name: string }[];
  actionTypeOptions: string[];
  moduleOptions: string[];
  totalCount: number;
  onFiltersChange: (filters: ActivityLogFilters) => void;
  onExportCsv: () => void;
}

const ActivityLogsExplorer = ({
  logs,
  filters,
  userOptions,
  actionTypeOptions,
  moduleOptions,
  totalCount,
  onFiltersChange,
  onExportCsv,
}: ActivityLogsExplorerProps) => {
  const update = (patch: Partial<ActivityLogFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity Logs Explorer</CardTitle>
          <Button size="sm" variant="outline" onClick={onExportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export CSV
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <Input
            placeholder="Search logs..."
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
          />
          <Select value={filters.userId} onValueChange={(v) => update({ userId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="User" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.actionType} onValueChange={(v) => update({ actionType: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypeOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.module} onValueChange={(v) => update({ module: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {moduleOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => update({ dateFrom: e.target.value })}
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => update({ dateTo: e.target.value })}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action Type</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No logs match the current filters.
                </TableCell>
              </TableRow>
            )}
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{log.time}</TableCell>
                <TableCell className="font-medium">{log.userName}</TableCell>
                <TableCell>{log.actionType}</TableCell>
                <TableCell>{log.module}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {log.description}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end pt-3 text-xs text-muted-foreground">
          Showing {logs.length} of {totalCount} logs
        </div>
      </CardContent>
    </Card>
  );
};

export default ActivityLogsExplorer;
